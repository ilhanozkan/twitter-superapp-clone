import { expect, test } from "@playwright/test";

import { idempotencyKey, unique, watchConsole } from "./helpers";

// DEMO_USERNAME=sarahcodes: the other side of a request and of a tip.
// seed-req01 (Sarah asks the demo user for 4.50) is cancelled by
// messages.sarah.spec.ts (§14.6), so this spec only looks at it, and cancels
// a request of its own.

test("Sarah's requests are listed as hers, and she can cancel one", async ({
  page,
  request,
}) => {
  const note = unique("Concert");
  const response = await request.post("/api/wallet/requests", {
    headers: { "Idempotency-Key": idempotencyKey() },
    data: { from: "devmarco", amount: 250, note },
  });
  expect(response.status()).toBe(201);

  await page.goto("/wallet?tab=requests");
  const mine = page.getByRole("region", { name: "Your requests" });

  const coffee = mine
    .getByRole("article")
    .filter({ hasText: "You requested 4.50 credits from Ilhan Ozkan" });
  await expect(coffee).toContainText("Coffee ☕");
  await expect(coffee.getByText(/^(Pending|Cancelled)$/)).toBeVisible();

  const card = mine.getByRole("article").filter({ hasText: note });
  await expect(card).toContainText(
    "You requested 2.50 credits from Marco Rossi"
  );
  await card
    .getByRole("button", { name: "Cancel your request to Marco Rossi" })
    .click();
  await expect(card.getByText("Cancelled", { exact: true })).toBeVisible();
});

test("the demo user's receipts are a 404 page for her", async ({ page }) => {
  const problems = watchConsole(page);
  // seed-tx03: Marco paid the demo user; Sarah is neither party.
  const response = await page.goto("/wallet/transactions/seed-tx03");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: "Page not found" })
  ).toBeVisible();
  await expect(page.getByText("Thanks for the code review")).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  // Chrome logs the document's own 404 status as a console error.
  expect(problems).toEqual([expect.stringContaining("status of 404")]);
});

test("her own Tweet shows its tips as text, with nothing to press", async ({
  page,
}) => {
  await page.goto("/sarahcodes");
  const row = page
    .locator("main article")
    .filter({ hasText: "Hot take: every icon-only button" })
    .getByRole("group", { name: "Tweet actions" });
  await expect(row.getByText(/^\d+ tips?$/)).toBeAttached();
  await expect(row.getByRole("button", { name: /^Tip/ })).toHaveCount(0);
  await expect(row.locator(":scope > *")).toHaveCount(6);
  await expect(page.getByRole("button", { name: /^Send credits/ })).toHaveCount(
    0
  );
});
