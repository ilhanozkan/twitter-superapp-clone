import { APIRequestContext, expect, Page, test } from "@playwright/test";

import {
  expectNoHorizontalScroll,
  expectNoSeriousViolations,
  features,
  idempotencyKey,
  setTheme,
  topUp,
  unique,
  watchConsole,
  WIDTHS,
} from "./helpers";

// Ordering as the demo user, on a server at SUPERAPP_TIME_SCALE=60: a
// Kızılay Kahve order is accepted 15 s after it is placed and delivered
// about 24 s after; a Twitter SuperApp order stays on its way for minutes.
// Specs create their own orders and assert balance deltas only. Orders
// left in progress are cancelled in `finally` (5 may be in progress).

test.beforeEach(async ({ request }) => {
  test.skip(!(await features(request)).orders, "Orders are off");
});

const KAHVE = { username: "kizilaykahve", fullname: "Kızılay Kahve" };

async function available(request: APIRequestContext): Promise<number> {
  const response = await request.get("/api/wallet");
  expect(response.status()).toBe(200);
  return (await response.json()).wallet.available;
}

/** Places an order through the API, priced from the business's menu now. */
async function placeOrder(
  request: APIRequestContext,
  business: string,
  productId: string
): Promise<{ id: string; code: string; total: number; acceptAt: string }> {
  const menu = await (await request.get(`/api/businesses/${business}`)).json();
  const product = menu.menu
    .flatMap(
      (section: { products: { id: string; price: number }[] }) =>
        section.products
    )
    .find((item: { id: string }) => item.id === productId);
  const expectedTotal = product.price + menu.business.deliveryFee;
  await topUp(request, expectedTotal);
  const response = await request.post("/api/orders", {
    headers: { "Idempotency-Key": idempotencyKey() },
    data: {
      business,
      items: [{ productId, quantity: 1 }],
      deliveryPlaceId: "tunali",
      expectedTotal,
    },
  });
  expect(response.status()).toBe(201);
  const { order } = await response.json();
  return {
    id: order.id,
    code: order.code,
    total: order.total,
    acceptAt: order.acceptAt,
  };
}

/** Cancels (and refunds) an order still in progress, as the business. */
async function cancelAsBusiness(request: APIRequestContext, id: string) {
  await request.post(`/api/orders/${id}/cancel`, {
    data: { as: "business" },
  });
}

/** A cart on this device, as the menu would have left it. */
async function withCart(page: Page) {
  await page.addInitScript((business) => {
    window.localStorage.setItem(
      "cart:v1",
      JSON.stringify({
        business,
        lines: [
          {
            productId: "seed-p-kk-latte",
            name: "Pistachio latte",
            unitPrice: 500,
            quantity: 1,
          },
        ],
      })
    );
  }, KAHVE);
}

test.describe("pages", () => {
  for (const [path, heading] of [
    ["/orders", "Your orders"],
    ["/orders/seed-o01", "Order #K7Q2 from Kızılay Kahve"],
    ["/checkout", "Checkout"],
    ["/business", "Business"],
  ]) {
    test(`${path} renders without errors`, async ({ page }) => {
      const problems = watchConsole(page);
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(
        page.getByRole("heading", { level: 1, name: heading })
      ).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(problems).toEqual([]);
    });
  }

  test("someone else's or an unknown order is a 404 page", async ({ page }) => {
    // seed-o02 is Sarah's, from a business the demo user runs: visible.
    expect((await page.goto("/orders/seed-o02"))?.status()).toBe(200);
    expect((await page.goto("/orders/no-such-order"))?.status()).toBe(404);
  });
});

test("Order now on seed-t22, delivered, then Tweet about it posts the card", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await topUp(request, 650);
  const before = await available(request);

  await page.goto("/kizilaykahve/status/seed-t22");
  await page
    .getByRole("group", { name: "Product: Pistachio latte" })
    .getByRole("button", { name: "Order now" })
    .click();
  const sheet = page.getByRole("dialog", { name: "Order now" });
  await expect(sheet).toContainText("Total6.50 credits");
  await sheet.getByRole("button", { name: "Pay 6.50 credits" }).click();
  const confirm = sheet.getByRole("button", {
    name: "Pay 6.50 credits to Kızılay Kahve",
  });
  await expect(confirm).toBeFocused();
  await confirm.click();
  await expect(
    sheet.getByRole("heading", { name: /^Order placed · #[2-9A-Z]{4}$/ })
  ).toBeFocused();
  expect(await available(request)).toBe(before - 650);

  await sheet.getByRole("link", { name: "Track order" }).click();
  await expect(page).toHaveURL(/\/orders\/order-/);
  await expect(sheet).toBeHidden();
  const progress = page.getByRole("region", { name: "Progress" });
  // Placed → Accepted → On the way → Delivered, on the page's own clock.
  await expect(
    page.getByRole("heading", { level: 2, name: /^Delivered at \d\d:\d\d$/ })
  ).toBeVisible({ timeout: 60_000 });
  await expect(progress.locator('[aria-current="step"]')).toContainText(
    "Delivered"
  );

  await page.getByRole("button", { name: "Tweet about it" }).click();
  const compose = page.getByRole("dialog", { name: "Compose Tweet" });
  const text = compose.getByLabel("Tweet text");
  await expect(text).toHaveValue(
    "Just had the Pistachio latte from @kizilaykahve, ordered right from a Tweet ☕ #SuperApp"
  );
  await expect(
    compose.getByRole("group", { name: "Attached product" })
  ).toContainText("Pistachio latte");
  const tag = unique("Two taps");
  await text.press("End");
  await text.pressSequentially(` ${tag}`);
  await compose.getByRole("button", { name: "Tweet", exact: true }).click();
  await expect(compose).toBeHidden();

  await page.goto("/illlhanozkan");
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: tag })
      .getByRole("group", { name: "Product: Pistachio latte" })
  ).toBeVisible();
});

test("checkout from the menu's cart opens the new order", async ({
  page,
  request,
}) => {
  await topUp(request, 1_400);
  await page.goto("/kizilaykahve/menu");
  await page.getByRole("button", { name: "Add Pistachio latte" }).click();
  await page.getByRole("button", { name: "Add one Pistachio latte" }).click();
  await page.getByRole("button", { name: "Add Simit" }).click();
  await page
    .getByRole("link", { name: "View cart · 3 items · 12.50 credits" })
    .click();

  await expect(page).toHaveURL(/\/checkout$/);
  const place = page.getByRole("button", {
    name: "Place order · 14.00 credits to Kızılay Kahve",
  });
  await expect(place).toBeVisible();
  await expect(page.getByRole("region", { name: "Payment" })).toContainText(
    "Total14.00 credits"
  );
  await page.getByLabel("Deliver to").selectOption("tunali");
  await page.getByLabel(/Note/).fill("Ring the bell");
  await place.click();

  await expect(page).toHaveURL(/\/orders\/order-/);
  await expect(
    page.getByRole("heading", { level: 1, name: /from Kızılay Kahve$/ })
  ).toBeVisible();
  const details = page.getByRole("region", { name: "Details" });
  await expect(details).toContainText("Pistachio latte ×2");
  await expect(details).toContainText("Simit ×1");
  await expect(details).toContainText("Tunalı Hilmi");
  await expect(details).toContainText("Ring the bell");

  // The cart is spent.
  await page.goto("/checkout");
  await expect(
    page.getByRole("heading", { name: "Your cart is empty" })
  ).toBeVisible();
});

test("cancelling within the window refunds in full", async ({
  page,
  request,
}) => {
  // The buyer's window is 15 s of real time (it does not scale), so a
  // stalled runner can see it close before the confirm lands. Only then,
  // refund that order as the business and try again with a fresh one.
  test.setTimeout(90_000);
  const dialog = page.getByRole("dialog", { name: "Cancel this order?" });
  const headline = page.getByRole("heading", {
    level: 2,
    name: "You cancelled",
  });
  for (let attempt = 1; ; attempt++) {
    await topUp(request, 650);
    const before = await available(request);
    const order = await placeOrder(request, "kizilaykahve", "seed-p-kk-latte");
    expect(await available(request)).toBe(before - order.total);
    const acceptAt = Date.parse(order.acceptAt);

    try {
      await page.goto(`/orders/${order.id}`);
      await page
        .getByRole("button", { name: "Cancel order" })
        .click({ timeout: Math.max(1, acceptAt - Date.now()) });
      await expect(dialog).toContainText("You get 6.50 credits back in full.");
      await dialog.getByRole("button", { name: "Cancel order" }).click();
      await expect(headline.or(dialog.getByRole("alert"))).toBeVisible();
      if (!(await headline.isVisible())) {
        throw new Error(await dialog.getByRole("alert").innerText());
      }
    } catch (error) {
      if (attempt === 3 || Date.now() < acceptAt) throw error;
      await cancelAsBusiness(request, order.id);
      continue;
    }

    await expect(headline).toBeFocused();
    await expect(
      page.getByText("6.50 credits refunded to your wallet")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Cancel order" })
    ).toHaveCount(0);
    expect(await available(request)).toBe(before);
    return;
  }
});

test("an order to @superapp is cancelled and refunded on the Business board", async ({
  page,
  request,
}) => {
  const order = await placeOrder(request, "superapp", "seed-p-sa-stickers");
  const before = await available(request);
  try {
    await page.goto("/business");
    const inProgress = page.getByRole("region", { name: "In progress" });
    const row = inProgress.getByRole("article", {
      name: `#${order.code} · Ilhan Ozkan`,
    });
    await expect(row).toContainText("Sticker pack ×1");
    await row
      .getByRole("button", { name: `Cancel & refund #${order.code}` })
      .click();
    const dialog = page.getByRole("dialog", { name: "Cancel and refund?" });
    await expect(dialog).toContainText(
      `Ilhan Ozkan gets 6.00 credits back for order #${order.code}.`
    );
    await dialog
      .getByRole("button", { name: "Cancel & refund 6.00 credits" })
      .click();

    await expect(row).toHaveCount(0);
    const completed = page
      .getByRole("region", { name: "Completed" })
      .getByRole("article", { name: `#${order.code} · Ilhan Ozkan` });
    await expect(completed).toContainText("You cancelled · refunded");
    await expect(
      completed.getByRole("heading", { name: `#${order.code} · Ilhan Ozkan` })
    ).toBeFocused();
    expect(await available(request)).toBe(before + order.total);
  } finally {
    await cancelAsBusiness(request, order.id);
  }
});

test("the Demo bot button adds an order to the board", async ({ page }) => {
  await page.goto("/business");
  const inProgress = page.getByRole("region", { name: "In progress" });
  const demoRows = inProgress
    .getByRole("article")
    .filter({ hasText: "Demo bot" });
  const before = await demoRows.count();

  await page
    .getByRole("button", { name: "Simulate a customer order · Demo bot" })
    .click();
  // The toast dismisses itself after 4 s of real time: check it first, before
  // the row count's retry backoff can use up that window on a slow runner.
  await expect(
    page.getByRole("status").filter({ hasText: /Demo bot placed order #/ })
  ).toBeVisible();
  await expect(demoRows).toHaveCount(before + 1);
  await expect(demoRows.first()).toContainText("Demo Customer (bot)");
});

test.describe("live activity", () => {
  test("an order in progress shows as a card at 1280 and a banner at 390", async ({
    page,
    request,
  }) => {
    const order = await placeOrder(request, "superapp", "seed-p-sa-stickers");
    try {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto("/");
      const card = page.getByRole("region", { name: "Happening now" });
      const item = card.getByRole("link", {
        name: /^Order from Twitter SuperApp/,
      });
      await expect(item.first()).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Live activity" })
      ).toBeHidden();

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/notifications");
      const banner = page.getByRole("region", { name: "Live activity" });
      await expect(banner).toContainText("Order from");
      await expect(card).toBeHidden();

      // Not on its own page.
      await page.goto(`/orders/${order.id}`);
      await expect(
        page.getByRole("heading", { level: 1, name: /from Twitter SuperApp$/ })
      ).toBeVisible();
      await expect(
        page
          .getByRole("region", { name: "Live activity" })
          .getByRole("link", { name: /^Order from Twitter SuperApp/ })
      ).toHaveCount(0);
    } finally {
      await cancelAsBusiness(request, order.id);
    }
  });
});

test("notifications say what happened to orders", async ({ page }) => {
  await page.goto("/notifications");
  await expect(
    page.getByRole("link", {
      name: "Your order #K7Q2 from Kızılay Kahve was delivered",
    })
  ).toHaveAttribute("href", "/orders/seed-o01");
  await expect(
    page.getByRole("link", {
      name: "New order #M2X9 from Marco Rossi at Twitter SuperApp",
    })
  ).toHaveAttribute("href", "/business");
});

test("Order again on Food refills the cart from a past order", async ({
  page,
}) => {
  await page.goto("/food");
  // The latest delivery from Kızılay Kahve: seed-o01, or a spec's order.
  const card = page
    .getByRole("region", { name: "Order again" })
    .getByRole("listitem")
    .filter({ hasText: "Kızılay Kahve" });
  const items = (await card.locator("p.text-muted").innerText())
    .split(", ")
    .map((item) => item.replace(/ ×\d+$/, ""));
  await card
    .getByRole("button", { name: "Order again from Kızılay Kahve" })
    .click();
  await expect(page).toHaveURL(/\/checkout$/);
  const lines = page.getByRole("region", { name: "Your order" });
  for (const item of items) await expect(lines).toContainText(item);
  await expect(
    page.getByRole("button", { name: /^Place order · .* to Kızılay Kahve$/ })
  ).toBeVisible();
});

test.describe("accessibility (axe)", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const path of [
      "/checkout",
      "/orders",
      "/orders/seed-o01",
      "/business",
    ]) {
      test(`${path} has no serious violations in ${theme} mode`, async ({
        page,
      }) => {
        await setTheme(page, theme);
        if (path === "/checkout") await withCart(page);
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        if (path === "/checkout") {
          await expect(
            page.getByRole("button", { name: /^Place order/ })
          ).toBeVisible();
        }
        await page.waitForLoadState("networkidle");
        await expectNoSeriousViolations(page);
      });
    }

    test(`an order in progress has no serious violations in ${theme} mode`, async ({
      page,
      request,
    }) => {
      const order = await placeOrder(request, "superapp", "seed-p-sa-stickers");
      try {
        await setTheme(page, theme);
        await page.goto(`/orders/${order.id}`);
        await expect(
          page.getByRole("button", { name: "Cancel order" })
        ).toBeVisible();
        await expectNoSeriousViolations(page);
      } finally {
        await cancelAsBusiness(request, order.id);
      }
    });

    test(`the quick order sheet has no serious violations in ${theme} mode`, async ({
      page,
    }) => {
      await setTheme(page, theme);
      await page.goto("/kizilaykahve/status/seed-t22");
      await page.getByRole("button", { name: "Order now" }).click();
      const sheet = page.getByRole("dialog", { name: "Order now" });
      await expect(sheet.getByRole("button", { name: /^Pay / })).toBeVisible();
      await expectNoSeriousViolations(page);
      await sheet.getByRole("button", { name: /^Pay / }).click();
      await expect(
        sheet.getByRole("button", { name: /to Kızılay Kahve$/ })
      ).toBeFocused();
      await expectNoSeriousViolations(page);
    });
  }
});

test.describe("responsive layout", () => {
  for (const width of WIDTHS) {
    test(`no horizontal scrolling at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await withCart(page);
      for (const path of [
        "/orders",
        "/orders/seed-o01",
        "/checkout",
        "/business",
        "/food",
      ]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await expectNoHorizontalScroll(page, `${path} at ${width}px`);
      }
    });
  }
});
