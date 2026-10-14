import {
  APIRequestContext,
  expect,
  Locator,
  Page,
  test,
} from "@playwright/test";

import {
  expectNoHorizontalScroll,
  expectNoSeriousViolations,
  setTheme,
  topUp,
  unique,
  watchConsole,
} from "./helpers";

// The wallet's controls as the demo user: Send, Request and Add credits
// through their dialogs, answering requests on /wallet, and tipping and
// paying people from Tweets and profiles. Balances are only ever compared
// as deltas (§10.7). seed-req03 and seed-req04 belong to this spec (§14.6).

async function available(request: APIRequestContext): Promise<number> {
  const response = await request.get("/api/wallet");
  expect(response.status()).toBe(200);
  return (await response.json()).wallet.available;
}

/** A seeded request this spec consumes; a reused server may have used it. */
async function stillPending(request: APIRequestContext, id: string) {
  const response = await request.get(`/api/wallet/requests/${id}`);
  return (await response.json()).request?.status === "pending";
}

async function openSend(page: Page): Promise<Locator> {
  await page
    .getByRole("region", { name: "Balance" })
    .getByRole("button", { name: "Send" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Send credits" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Sarah's "Hot take" Tweet on her profile, where nothing else pushes it down. */
async function sarahsTweet(page: Page): Promise<Locator> {
  await page.goto("/sarahcodes");
  const card = page
    .locator("main article")
    .filter({ hasText: "Hot take: every icon-only button" });
  await expect(card).toBeVisible();
  return card;
}

/** The Tip button, before or after a tip (a reused server may have one). */
const tipButton = (card: Locator) =>
  card.getByRole("button", { name: /^Tip( again)?\. / });

async function openTip(page: Page): Promise<Locator> {
  const card = await sarahsTweet(page);
  await tipButton(card).click();
  const sheet = page.getByRole("dialog", { name: "Tip @sarahcodes" });
  await expect(sheet).toBeVisible();
  return sheet;
}

/**
 * The contrast of an element's outline (2px or more) against the first
 * opaque background behind it; 0 without one.
 */
async function outlineContrast(element: Locator): Promise<number> {
  return element.evaluate((node) => {
    const style = getComputedStyle(node);
    if (style.outlineStyle === "none" || parseFloat(style.outlineWidth) < 2) {
      return 0;
    }
    const channels = (color: string) =>
      (color.match(/[\d.]+/g) ?? []).map(Number);
    let behind = [255, 255, 255];
    for (let at = node.parentElement; at; at = at.parentElement) {
      const [r, g, b, alpha = 1] = channels(
        getComputedStyle(at).backgroundColor
      );
      if (alpha === 1) {
        behind = [r, g, b];
        break;
      }
    }
    const luminance = ([r, g, b]: number[]) => {
      const [lr, lg, lb] = [r, g, b].map((value) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
    };
    const [l1, l2] = [
      luminance(channels(style.outlineColor)),
      luminance(behind),
    ].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  });
}

async function chooseSarah(dialog: Locator) {
  await dialog.getByRole("combobox", { name: "To" }).fill("sarah");
  await dialog.getByRole("option", { name: /Sarah Chen/ }).click();
}

test("sends 10.00 to Sarah through the dialog, then opens the receipt", async ({
  page,
  request,
}) => {
  const problems = watchConsole(page);
  await topUp(request, 2_000);
  const before = await available(request);
  const note = unique("Pizza");

  await page.goto("/wallet");
  const dialog = await openSend(page);
  await chooseSarah(dialog);
  await dialog.getByRole("textbox", { name: "Amount in credits" }).fill("10");
  await dialog.getByRole("textbox", { name: /Note/ }).fill(note);
  await dialog.getByRole("button", { name: "Review" }).click();

  const confirm = dialog.getByRole("button", {
    name: "Send 10.00 credits to Sarah Chen",
  });
  await expect(confirm).toBeFocused();
  await expect(dialog).toContainText(
    "Send 10.00 credits to Sarah Chen (@sarahcodes)"
  );
  await confirm.click();

  await expect(dialog.getByRole("heading", { name: "Sent" })).toBeVisible();
  await expect(
    page.getByRole("status").getByRole("link", { name: "Receipt" })
  ).toBeVisible();
  expect(await available(request)).toBe(before - 1_000);

  // The activity shows it without a reload.
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
  const activity = page.getByRole("region", { name: "Activity" });
  await expect(
    activity.getByRole("link", { name: /Payment to Sarah Chen/ }).first()
  ).toBeVisible();

  await activity
    .getByRole("link", { name: /Payment to Sarah Chen/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/wallet\/transactions\/tx-/);
  await expect(page.getByText(note)).toBeVisible();
  await expect(
    page.getByText("sent 10.00 credits", { exact: true })
  ).toBeAttached();
  expect(problems).toEqual([]);
});

test("Escape closes the suggestions before the dialog", async ({ page }) => {
  await page.goto("/wallet");
  const dialog = await openSend(page);
  const combobox = dialog.getByRole("combobox", { name: "To" });
  await combobox.fill("sarah");
  await expect(
    dialog.getByRole("option", { name: /Sarah Chen/ })
  ).toBeVisible();
  await expect(combobox).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("Escape");
  await expect(combobox).toHaveAttribute("aria-expanded", "false");
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(combobox).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("asks Sarah for credits, then cancels the request", async ({ page }) => {
  const note = unique("Tickets");
  await page.goto("/wallet");
  await page
    .getByRole("region", { name: "Balance" })
    .getByRole("button", { name: "Request" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Request credits" });
  await dialog.getByRole("combobox", { name: "From" }).fill("sarah");
  await dialog.getByRole("option", { name: /Sarah Chen/ }).click();
  await dialog.getByRole("textbox", { name: "Amount in credits" }).fill("3");
  await dialog.getByRole("textbox", { name: /Note/ }).fill(note);
  await dialog.getByRole("button", { name: "Review" }).click();
  await dialog
    .getByRole("button", { name: "Request 3.00 credits from Sarah Chen" })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Request sent" })
  ).toBeVisible();

  await dialog.getByRole("link", { name: "View your requests" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/wallet\?tab=requests$/);
  const card = page
    .getByRole("region", { name: "Your requests" })
    .getByRole("article")
    .filter({ hasText: note });
  await expect(card).toContainText(
    "You requested 3.00 credits from Sarah Chen"
  );
  await expect(card.getByText("Pending", { exact: true })).toBeVisible();

  await card
    .getByRole("button", { name: "Cancel your request to Sarah Chen" })
    .click();
  await expect(card.getByText("Cancelled", { exact: true })).toBeVisible();

  // The tabs switch in place, each with its own URL.
  const tabs = page.getByRole("navigation", { name: "Wallet history" });
  await tabs.getByRole("link", { name: "Activity" }).click();
  await expect(page).toHaveURL(/\/wallet$/);
  await expect(page.getByRole("region", { name: "Activity" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Your requests" })
  ).toBeHidden();
  await tabs.getByRole("link", { name: "Requests" }).click();
  await expect(card).toBeVisible();
});

test("adds demo credits, when today's top-ups allow", async ({
  page,
  request,
}) => {
  const { wallet, limits } = await (await request.get("/api/wallet")).json();
  test.skip(
    limits.topUpsLeftToday === 0 || wallet.balance + 2_500 > limits.topUpCap,
    "No top-up left on this server today"
  );
  const before = await available(request);

  await page.goto("/wallet");
  await page
    .getByRole("region", { name: "Balance" })
    .getByRole("button", { name: "Add credits" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Add credits" });
  await expect(
    dialog.getByText("Demo credits are free and have no cash value.")
  ).toBeVisible();
  await dialog.getByText("25.00", { exact: true }).click();
  await dialog.getByRole("button", { name: "Add 25.00 demo credits" }).click();

  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("status").getByText("Added 25.00 demo credits")
  ).toBeVisible();
  expect(await available(request)).toBe(before + 2_500);
});

test("pays seed-req03 on the wallet page", async ({ page, request }) => {
  test.skip(
    !(await stillPending(request, "seed-req03")),
    "seed-req03 was answered by an earlier run on this server"
  );
  await topUp(request, 300);
  const before = await available(request);

  await page.goto("/wallet");
  const requests = page.getByRole("region", { name: "Requests for you" });
  await requests
    .getByRole("button", { name: "Pay 3.00 credits to Marco Rossi" })
    .click();
  const sheet = page.getByRole("dialog", { name: "Pay request" });
  const confirm = sheet.getByRole("button", {
    name: "Pay 3.00 credits to Marco Rossi",
  });
  await expect(confirm).toBeFocused();
  await confirm.click();

  await expect(sheet).toBeHidden();
  const card = requests.getByRole("article").filter({ hasText: "Parking" });
  await expect(card.getByText("Paid", { exact: true })).toBeVisible();
  await expect(card.getByRole("link", { name: "View receipt" })).toBeVisible();
  expect(await available(request)).toBe(before - 300);
});

test("declines seed-req04", async ({ page, request }) => {
  test.skip(
    !(await stillPending(request, "seed-req04")),
    "seed-req04 was answered by an earlier run on this server"
  );
  await page.goto("/wallet");
  const card = page
    .getByRole("region", { name: "Requests for you" })
    .getByRole("article")
    .filter({ hasText: "Team lunch" });
  await card
    .getByRole("button", { name: "Decline Priya Nair’s request" })
    .click();
  await expect(card.getByText("Declined", { exact: true })).toBeVisible();

  const response = await request.get("/api/wallet/requests/seed-req04");
  expect((await response.json()).request.status).toBe("declined");
});

test("tips seed-t02, which then shows the tip and links its receipt", async ({
  page,
  request,
}) => {
  const problems = watchConsole(page);
  await topUp(request, 500);
  const before = await available(request);
  const tips = (await (await request.get("/api/tweets/seed-t02")).json()).tweet
    .stats.tips;

  const sheet = await openTip(page);
  await expect(sheet).toContainText("Hot take: every icon-only button");
  await expect(
    sheet.getByRole("radio", { name: "2.00 credits" })
  ).toBeFocused();
  await sheet.getByText("1.00", { exact: true }).click();
  await sheet
    .getByRole("textbox", { name: /Say thanks/ })
    .fill(unique("Great tip"));
  await sheet.getByRole("button", { name: "Tip 1.00 credits" }).click();

  const confirm = sheet.getByRole("button", {
    name: "Tip 1.00 credits to Sarah Chen",
  });
  await expect(confirm).toBeFocused();
  await confirm.click();
  await expect(sheet).toBeHidden();

  // The count went up by one and the coin is filled, from the server's Tweet.
  const card = page
    .locator("main article")
    .filter({ hasText: "Hot take: every icon-only button" });
  const tipped = card.getByRole("button", {
    name: `Tip again. You tipped this Tweet. ${tips + 1} ${tips + 1 === 1 ? "tip" : "tips"}`,
  });
  await expect(tipped).toHaveText(String(tips + 1));
  await expect(tipped).toHaveClass(/text-tip/);
  await expect(tipped).toBeFocused();
  expect(await available(request)).toBe(before - 100);

  const toast = page.getByRole("status").filter({
    hasText: "You tipped @sarahcodes 1.00 credits",
  });
  await toast.getByRole("link", { name: "Receipt" }).click();
  await expect(page).toHaveURL(/\/wallet\/transactions\/tx-/);
  await expect(page.getByText("Tip on @sarahcodes's Tweet")).toBeVisible();
  expect(problems).toEqual([]);
});

test("a tip confirmed after going Back closes the sheet and shows on the page left", async ({
  page,
  request,
}) => {
  await topUp(request, 500);
  const before = await available(request);
  const tips = (await (await request.get("/api/tweets/seed-t02")).json()).tweet
    .stats.tips;

  // From the Tweet's page to Sarah's profile (a client navigation), to tip there.
  await page.goto("/sarahcodes/status/seed-t02");
  await page.locator("#focused-tweet-author").click();
  await expect(page).toHaveURL(/\/sarahcodes$/);
  const card = page
    .locator("main article")
    .filter({ hasText: "Hot take: every icon-only button" });
  await tipButton(card).click();
  const sheet = page.getByRole("dialog", { name: "Tip @sarahcodes" });
  await sheet.getByRole("button", { name: "Tip 2.00 credits" }).click();

  // The tip reaches the server only once Back has read the Tweet's page.
  let release = () => {};
  const readBack = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/tweets/seed-t02/tip", async (route) => {
    await readBack;
    await route.fulfill({ response: await route.fetch() });
  });
  await sheet
    .getByRole("button", { name: "Tip 2.00 credits to Sarah Chen" })
    .click();
  const pageData = page.waitForResponse(
    (response) =>
      response.url().includes("/_next/data/") &&
      response.url().includes("seed-t02")
  );
  await page.goBack();
  await pageData;
  await expect(page).toHaveURL(/\/sarahcodes\/status\/seed-t02$/);
  release();

  await expect(
    page.getByRole("status").filter({
      hasText: "You tipped @sarahcodes 2.00 credits",
    })
  ).toBeVisible();
  // Closed, so nothing can tip a second time with a new key.
  await expect(sheet).toBeHidden();
  const count = tips + 1;
  await expect(
    page.locator("main").getByRole("button", {
      name: `Tip again. You tipped this Tweet. ${count} ${count === 1 ? "tip" : "tips"}`,
    })
  ).toBeVisible();
  expect(await available(request)).toBe(before - 200);
});

test("Send credits opens for the person from a profile and from a Tweet's menu", async ({
  page,
}) => {
  const card = await sarahsTweet(page);
  await page
    .getByRole("button", { name: "Send credits to @sarahcodes" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Send credits" });
  // Locked on Sarah: straight to the amount, no way to pick someone else.
  await expect(
    dialog.getByRole("textbox", { name: "Amount in credits" })
  ).toBeFocused();
  await expect(dialog).toContainText("@sarahcodes");
  await expect(dialog.getByRole("combobox")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await card.getByRole("button", { name: "More options" }).click();
  await page
    .getByRole("menuitem", { name: "Send credits to @sarahcodes" })
    .click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("@sarahcodes");
  await expect(dialog.getByRole("combobox")).toHaveCount(0);
});

/** Each action row on the page: how many actions, and how far past its edge. */
async function actionRows(page: Page) {
  const rows = page.getByRole("group", { name: "Tweet actions" });
  await expect(rows.first()).toBeVisible();
  return rows.evaluateAll((groups) =>
    groups.map((group) => {
      const box = group.getBoundingClientRect();
      const last = group.lastElementChild?.getBoundingClientRect();
      return {
        actions: group.children.length,
        overflow: Math.max(
          group.scrollWidth - group.clientWidth,
          (last?.right ?? 0) - box.right
        ),
      };
    })
  );
}

test("the six Tweet actions fit a 360px phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  // Home's first page may hold only the demo user's own Tweets (other specs
  // post them), where Tip is text; Sarah's profile has Tip buttons.
  for (const path of ["/", "/sarahcodes"]) {
    await page.goto(path);
    const rows = await actionRows(page);
    await expectNoHorizontalScroll(page, `${path} at 360px`);
    for (const row of rows) {
      expect(row.actions, path).toBe(6);
      expect(row.overflow, path).toBeLessThanOrEqual(0.5);
    }
  }
  await expect(
    page.getByRole("button", { name: /^Tip( again)?\. / }).first()
  ).toBeVisible();
});

test("the Send sheet fits a 360px phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/wallet");
  const dialog = await openSend(page);
  await chooseSarah(dialog);
  await expectNoHorizontalScroll(page, "Send sheet at 360px");
  // A bottom sheet on phones: the full width of the screen.
  const box = await dialog.boundingBox();
  expect(Math.round(box?.width ?? 0)).toBe(360);
});

test.describe("accessibility (axe)", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`the Send review and Add credits dialogs in ${theme} mode`, async ({
      page,
      request,
    }) => {
      await topUp(request, 1_000);
      await setTheme(page, theme);
      await page.goto("/wallet");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

      const dialog = await openSend(page);
      // Focus stays in the field, so the highlighted suggestion's outline is
      // the listbox's focus indicator: 3:1 against the sheet (1.4.11).
      await dialog.getByRole("combobox", { name: "To" }).fill("sarah");
      const option = dialog.getByRole("option", { name: /Sarah Chen/ });
      await expect(option).toBeVisible();
      await page.keyboard.press("ArrowDown");
      await expect(option).toHaveAttribute("aria-selected", "true");
      expect(await outlineContrast(option)).toBeGreaterThanOrEqual(3);
      await page.keyboard.press("Enter");
      await dialog
        .getByRole("textbox", { name: "Amount in credits" })
        .fill("5");
      await dialog.getByRole("button", { name: "Review" }).click();
      await expect(
        dialog.getByRole("button", { name: "Send 5.00 credits to Sarah Chen" })
      ).toBeFocused();
      await expectNoSeriousViolations(page);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();

      await page
        .getByRole("region", { name: "Balance" })
        .getByRole("button", { name: "Add credits" })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Add credits" })
      ).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    test(`the Tip sheet and its review in ${theme} mode`, async ({
      page,
      request,
    }) => {
      await topUp(request, 500);
      await setTheme(page, theme);
      const sheet = await openTip(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(
        sheet.getByRole("radio", { name: "2.00 credits" })
      ).toBeFocused();
      await expectNoSeriousViolations(page);

      await sheet.getByRole("button", { name: "Tip 2.00 credits" }).click();
      await expect(
        sheet.getByRole("button", { name: "Tip 2.00 credits to Sarah Chen" })
      ).toBeFocused();
      await expectNoSeriousViolations(page);
    });
  }
});
