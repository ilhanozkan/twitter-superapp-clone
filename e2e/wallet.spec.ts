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
// through their dialogs, and answering requests on /wallet. Balances are
// only ever compared as deltas (§10.7). seed-req03 and seed-req04 belong
// to this spec (§14.6).

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
      await chooseSarah(dialog);
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
  }
});
