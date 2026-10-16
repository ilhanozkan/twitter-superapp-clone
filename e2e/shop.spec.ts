import { expect, Page, test } from "@playwright/test";

import {
  expectNoHorizontalScroll,
  expectNoSeriousViolations,
  features,
  setTheme,
  unique,
  watchConsole,
  WIDTHS,
} from "./helpers";

// The shop as the demo user sees it: business profiles and menus, product
// cards on Tweets, the Food hub, attaching a product to a Tweet, and the
// Business page of @superapp, which the demo user manages. Switches a test
// turns are turned back in `finally`, because servers may be reused.

test.beforeEach(async ({ request }) => {
  test.skip(!(await features(request)).shop, "The shop is off");
});

const PAGES: [string, string][] = [
  ["/food", "Food"],
  ["/kizilaykahve/menu", "Kızılay Kahve"],
  ["/business", "Business"],
  ["/business?tab=settings", "Business"],
];

test.describe("pages", () => {
  for (const [path, heading] of PAGES) {
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
});

test.describe("profiles and menus", () => {
  test("a business profile shows its details, the Menu tab and Order", async ({
    page,
  }) => {
    await page.goto("/kizilaykahve");
    await expect(page.getByText("Business · Café")).toBeVisible();
    await expect(page.getByText("Open 24 hours")).toBeVisible();
    await expect(
      page.getByText("Delivery 9–12 min · 1.50 credits fee · Min. 3.00")
    ).toBeVisible();
    await expect(
      page.getByText("Kızılay Square, Çankaya, Ankara")
    ).toBeVisible();
    const tabs = page.getByRole("navigation", { name: "Profile timelines" });
    await expect(tabs.getByRole("link")).toHaveText([
      "Tweets",
      "Menu",
      "Likes",
    ]);

    await page.getByRole("link", { name: "Order", exact: true }).click();
    await expect(page).toHaveURL(/\/kizilaykahve\/menu$/);
    await expect(tabs.getByRole("link", { name: "Menu" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(
      page.getByRole("heading", { level: 2, name: "Coffee" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Bakery" })
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: /A golden simit bread ring/ })
    ).toBeVisible();
  });

  test("people have no business details, Menu tab or Order", async ({
    page,
  }) => {
    await page.goto("/sarahcodes");
    const tabs = page.getByRole("navigation", { name: "Profile timelines" });
    await expect(tabs.getByRole("link")).toHaveText(["Tweets", "Likes"]);
    await expect(
      page.getByRole("link", { name: "Order", exact: true })
    ).toHaveCount(0);
    expect((await page.goto("/sarahcodes/menu"))?.status()).toBe(404);
  });

  test("a product's details open from the menu and from their URL", async ({
    page,
  }) => {
    await page.goto("/kizilaykahve/menu");
    await page.getByRole("link", { name: "Pistachio latte" }).click();
    await expect(page).toHaveURL(
      /\/kizilaykahve\/menu\?product=seed-p-kk-latte$/
    );
    const dialog = page.getByRole("dialog", { name: "Pistachio latte" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("5.00 credits");
    await expect(dialog).toContainText("Open 24 hours");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/kizilaykahve\/menu$/);

    await page.goto("/kizilaykahve/menu?product=seed-p-kk-simit");
    const simit = page.getByRole("dialog", { name: "Simit" });
    await expect(simit).toBeVisible();
    await simit.getByRole("button", { name: "Close" }).click();
    await expect(simit).toBeHidden();
    await expect(page).toHaveURL(/\/kizilaykahve\/menu$/);
  });
});

test.describe("product cards on Tweets", () => {
  test("seed-t22 carries the Pistachio latte", async ({ page, request }) => {
    const { orders } = await features(request);
    await page.goto("/kizilaykahve/status/seed-t22");
    const card = page.getByRole("group", { name: "Product: Pistachio latte" });
    await expect(card).toContainText("5.00 credits");
    await expect(card).toContainText("Kızılay Kahve · Open · 9–12 min");
    await expect(
      card.getByRole("img", { name: /pistachio latte/i })
    ).toBeVisible();
    // Order now belongs to the orders feature.
    await expect(card.getByRole("button", { name: "Order now" })).toHaveCount(
      orders ? 1 : 0
    );

    await card.getByRole("link", { name: "View menu" }).click();
    await expect(page).toHaveURL(/\/kizilaykahve\/menu$/);
  });

  test("the card's links work inside a timeline without opening the Tweet", async ({
    page,
  }) => {
    await page.goto("/kizilaykahve");
    const card = page
      .getByRole("article")
      .filter({ hasText: "New on the menu: pistachio latte" })
      .getByRole("group", { name: "Product: Pistachio latte" });
    await card.getByRole("link", { name: "Pistachio latte" }).click();
    await expect(page).toHaveURL(
      /\/kizilaykahve\/menu\?product=seed-p-kk-latte$/
    );
    await expect(
      page.getByRole("dialog", { name: "Pistachio latte" })
    ).toBeVisible();
  });

  test("a product attached in the composer shows on the posted Tweet", async ({
    page,
  }) => {
    const text = unique("Stickers for every laptop");
    await page.goto("/");
    await page.getByLabel("Tweet text").fill(text);
    const main = page.getByRole("main");
    await main.getByRole("button", { name: "Attach a product" }).click();

    // The demo user manages @superapp: its available products are offered.
    const picker = page.getByRole("dialog", { name: "Attach a product" });
    await expect(picker.getByRole("button", { name: /Hoodie/ })).toHaveCount(0);
    await picker.getByRole("button", { name: /Sticker pack/ }).click();
    await expect(picker).toBeHidden();
    const preview = main.getByRole("group", { name: "Attached product" });
    await expect(preview).toContainText("Sticker pack");
    await expect(preview).toContainText("3.00 credits");

    await main.getByRole("button", { name: "Tweet", exact: true }).click();
    const posted = page.locator("main article").filter({ hasText: text });
    await expect(
      posted.getByRole("group", { name: "Product: Sticker pack" })
    ).toBeVisible();
    await expect(preview).toHaveCount(0);

    await page.reload();
    await expect(
      page
        .locator("main article")
        .filter({ hasText: text })
        .getByRole("group", { name: "Product: Sticker pack" })
    ).toBeVisible();
  });
});

test.describe("attaching a product in the Compose dialog", () => {
  const OPENERS = [
    {
      label: "the sidebar's Tweet button",
      width: 1366,
      opener: (page: Page) =>
        page
          .getByRole("banner")
          .getByRole("button", { name: "Tweet", exact: true }),
    },
    {
      label: "the phone's Compose button",
      width: 390,
      opener: (page: Page) =>
        page.getByRole("button", { name: "Compose a Tweet" }),
    },
  ];

  for (const { label, width, opener } of OPENERS) {
    test(`keeps the draft, from ${label}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      const text = unique("Stickers from the dialog");
      await page.goto("/notifications");
      await opener(page).click();
      const compose = page.getByRole("dialog", { name: "Compose Tweet" });
      await compose.getByLabel("Tweet text").fill(text);
      const attach = compose.getByRole("button", { name: "Attach a product" });
      const picker = page.getByRole("dialog", { name: "Attach a product" });

      // Escape closes the picker only, and focus returns to its button.
      await attach.click();
      await expect(
        picker.getByRole("button", { name: /Sticker pack/ })
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(picker).toBeHidden();
      await expect(compose).toBeVisible();
      await expect(attach).toBeFocused();

      await attach.click();
      await picker.getByRole("button", { name: /Sticker pack/ }).click();
      await expect(picker).toBeHidden();
      await expect(compose.getByLabel("Tweet text")).toHaveValue(text);
      await expect(
        compose.getByRole("group", { name: "Attached product" })
      ).toContainText("Sticker pack");

      await compose.getByRole("button", { name: "Tweet", exact: true }).click();
      await expect(compose).toBeHidden();
      await page.goto("/");
      await expect(
        page
          .locator("main article")
          .filter({ hasText: text })
          .getByRole("group", { name: "Product: Sticker pack" })
      ).toBeVisible();
    });
  }
});

test.describe("Food and Services", () => {
  test("the Food hub filters places by category", async ({ page }) => {
    await page.goto("/food");
    const places = page.getByRole("list", { name: "Places" });
    const chips = page.getByRole("group", { name: "Categories" });
    await expect(
      places.getByRole("heading", { name: "Lahmacun Lab" })
    ).toBeVisible();
    await expect(chips.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await chips.getByRole("button", { name: "Café" }).click();
    await expect(chips.getByRole("button", { name: "Café" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(chips.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    await expect(
      places.getByRole("heading", { name: "Lahmacun Lab" })
    ).toHaveCount(0);
    const kahve = places.getByRole("link", { name: /Kızılay Kahve/ });
    await expect(kahve).toContainText("Open 24 hours");
    await expect(kahve).toContainText("9–12 min · 1.50 credits fee");

    await kahve.click();
    await expect(page).toHaveURL(/\/kizilaykahve\/menu$/);
  });

  test("Services offers places to order from", async ({ page }) => {
    await page.goto("/services");
    const row = page.getByRole("region", { name: "Order from" });
    await row.getByRole("link", { name: /Lahmacun Lab/ }).click();
    await expect(page).toHaveURL(/\/lahmacunlab\/menu$/);
  });
});

test.describe("the Business page", () => {
  test("marking the Mug sold out shows on its menu, and back", async ({
    page,
    request,
  }) => {
    const mug = "seed-p-sa-mug";
    const saved = () =>
      page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/products/${mug}/availability`) &&
          response.request().method() === "PUT"
      );
    const mugOnMenu = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: "SuperApp mug" }) });

    try {
      await page.goto("/business");
      const toggle = page.getByRole("switch", { name: "SuperApp mug" });
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      const off = saved();
      await toggle.click();
      expect((await off).status()).toBe(200);
      await expect(toggle).toHaveAttribute("aria-checked", "false");

      await page.goto("/superapp/menu");
      // The badge (and, once orders are on, the disabled Add says it too).
      await expect(
        mugOnMenu.getByText("Sold out", { exact: true }).first()
      ).toBeVisible();

      await page.goto("/business");
      const on = saved();
      await toggle.click();
      expect((await on).status()).toBe(200);
      await expect(toggle).toHaveAttribute("aria-checked", "true");

      await page.goto("/superapp/menu");
      await expect(mugOnMenu).toBeVisible();
      await expect(
        mugOnMenu.getByText("Sold out", { exact: true })
      ).toHaveCount(0);
    } finally {
      await request.put(`/api/products/${mug}/availability`, {
        data: { available: true },
      });
    }
  });

  test("pausing orders shows on the profile, and back", async ({
    page,
    request,
  }) => {
    try {
      await page.goto("/business");
      const accepting = page.getByRole("switch", { name: "Accepting orders" });
      await expect(accepting).toHaveAttribute("aria-checked", "true");
      await accepting.click();
      await expect(accepting).toHaveAttribute("aria-checked", "false");
      await expect(
        page.getByText("Not taking orders right now", { exact: true })
      ).toBeVisible();

      await page.goto("/superapp");
      // The profile's details; once orders are on, its cards say it too.
      await expect(
        page.getByText("Not taking orders right now", { exact: true }).first()
      ).toBeVisible();

      await page.goto("/business");
      await accepting.click();
      await expect(accepting).toHaveAttribute("aria-checked", "true");
      await expect(page.getByText("Open 24 hours")).toBeVisible();
    } finally {
      await request.put("/api/businesses/superapp/settings", {
        data: { acceptingOrders: true },
      });
    }
  });

  test("Settings shows the profile read-only", async ({ page }) => {
    await page.goto("/business");
    await page
      .getByRole("navigation", { name: "Business tools" })
      .getByRole("link", { name: "Settings" })
      .click();
    await expect(page).toHaveURL(/\/business\?tab=settings$/);
    await expect(
      page.getByText("Edit in Studio", { exact: false })
    ).toBeVisible();
    await expect(page.getByText("@superapp, @illlhanozkan")).toBeVisible();
  });
});

// What C1 builds for ordering: it shows only once the orders feature is on.
test.describe("with orders on", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await features(request)).orders, "Orders are off");
  });

  test("the new-cart prompt leaves a product's details open", async ({
    page,
  }) => {
    await page.goto("/kizilaykahve/menu");
    await page.getByRole("button", { name: "Add Simit" }).click();
    await page.goto("/lahmacunlab/menu");
    await page.getByRole("link", { name: "Lahmacun", exact: true }).click();
    const details = page.getByRole("dialog", { name: "Lahmacun" });
    const prompt = page.getByRole("dialog", { name: "Start a new cart?" });
    const url = /\/lahmacunlab\/menu\?product=seed-p-ll-lahmacun$/;

    await details.getByRole("button", { name: "Add Lahmacun" }).click();
    await prompt.getByRole("button", { name: "Cancel" }).click();
    await expect(prompt).toBeHidden();
    await expect(details).toBeVisible();
    await expect(page).toHaveURL(url);

    await details.getByRole("button", { name: "Add Lahmacun" }).click();
    await page.keyboard.press("Escape");
    await expect(prompt).toBeHidden();
    await expect(details).toBeVisible();

    await details.getByRole("button", { name: "Add Lahmacun" }).click();
    await prompt.getByRole("button", { name: "Start new cart" }).click();
    await expect(details).toBeVisible();
    await expect(page).toHaveURL(url);
    await expect(
      details.getByRole("button", { name: "Add one Lahmacun" })
    ).toBeFocused();
    // The page's own status is inert behind the dialog: it has its own.
    await expect(details.locator('[aria-live="polite"]')).toHaveText(
      "Your cart: 1 item · 4.00 credits"
    );
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    test(`focus stays clear of the cart bar at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/kizilaykahve/menu");
      await page.getByRole("button", { name: "Add Simit" }).click();
      await page.reload();
      await expect(
        page.getByRole("link", { name: /^View cart/ })
      ).toBeVisible();

      // Tab from the top through every control on the menu.
      await page.locator("main").focus();
      const hidden: string[] = [];
      for (let step = 0; step < 40; step++) {
        await page.keyboard.press("Tab");
        const state = await page.evaluate(() => {
          const focused = document.activeElement as HTMLElement | null;
          if (!focused || !focused.closest("main")) return null;
          const box = focused.getBoundingClientRect();
          const hit = document.elementFromPoint(
            box.left + box.width / 2,
            box.top + box.height / 2
          );
          return {
            name:
              focused.getAttribute("aria-label") ?? focused.textContent ?? "",
            covered: !!hit && !focused.contains(hit),
            isBar: focused.getAttribute("href") === "/checkout",
          };
        });
        if (!state || state.isBar) break;
        if (state.covered) hidden.push(state.name);
      }
      expect(hidden).toEqual([]);
    });
  }

  test("clicking a disabled Order now doesn't open the Tweet", async ({
    page,
    request,
  }) => {
    try {
      const paused = await request.put("/api/businesses/superapp/settings", {
        data: { acceptingOrders: false },
      });
      expect(paused.status()).toBe(200);
      await page.goto("/superapp");
      const order = page
        .getByRole("article")
        .filter({ hasText: "The SuperApp store is open" })
        .getByRole("button", { name: "Order now" });
      await order.scrollIntoViewIfNeeded();
      await expect(order).toBeDisabled();
      // A disabled button has no pointer events: the click lands around it.
      const opened = page.waitForURL(/\/status\//, { timeout: 2_000 }).then(
        () => true,
        () => false
      );
      const box = (await order.boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      expect(await opened).toBe(false);
    } finally {
      await request.put("/api/businesses/superapp/settings", {
        data: { acceptingOrders: true },
      });
    }
  });
});

test.describe("accessibility (axe)", () => {
  const AXE_PAGES = [
    "/food",
    // Its seed Tweet, first on the page, has a mention.
    "/lahmacunlab",
    "/kizilaykahve/menu",
    "/kizilaykahve/menu?product=seed-p-kk-latte",
    "/kizilaykahve/status/seed-t22",
    "/business",
    "/business?tab=settings",
  ];

  for (const theme of ["light", "dark"] as const) {
    for (const path of AXE_PAGES) {
      test(`${path} has no serious violations in ${theme} mode`, async ({
        page,
      }) => {
        await setTheme(page, theme);
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        if (path.includes("?product=")) {
          await expect(page.getByRole("dialog")).toBeVisible();
        }
        await page.waitForLoadState("networkidle");
        await expectNoSeriousViolations(page);
      });
    }

    test(`the composer's product picker has no serious violations in ${theme} mode`, async ({
      page,
    }) => {
      await setTheme(page, theme);
      await page.goto("/");
      await page
        .getByRole("main")
        .getByRole("button", { name: "Attach a product" })
        .click();
      await expect(
        page
          .getByRole("dialog", { name: "Attach a product" })
          .getByRole("button", { name: /Sticker pack/ })
      ).toBeVisible();
      await expectNoSeriousViolations(page);
    });
  }
});

test.describe("responsive layout", () => {
  for (const width of WIDTHS) {
    test(`no horizontal scrolling at ${width}px`, async ({ page }) => {
      // Nine page loads, each waiting for the network to go quiet: about 9 s
      // on a fast machine but 30 s or more on a slow CI runner.
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height: 900 });
      for (const path of [
        "/food",
        "/kizilaykahve",
        "/kizilaykahve/menu",
        "/kizilaykahve/menu?product=seed-p-kk-latte",
        "/kizilaykahve/status/seed-t22",
        "/business",
        "/business?tab=settings",
        "/services",
      ]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await expectNoHorizontalScroll(page, `${path} at ${width}px`);
      }
    });
  }
});
