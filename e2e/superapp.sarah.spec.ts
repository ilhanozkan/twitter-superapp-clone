import { expect, test } from "@playwright/test";

import { watchConsole } from "./helpers";

// DEMO_USERNAME=sarahcodes: receipts are visible to their two parties only.
// seed-tx01 is the demo user's tip to lenaframes; seed-tx02 is Sarah's tip
// to the demo user.

test("someone else's receipt is a 404 page", async ({ page }) => {
  const problems = watchConsole(page);
  const response = await page.goto("/wallet/transactions/seed-tx01");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: "Page not found" })
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  // Chrome logs the document's own 404 status as a console error.
  expect(problems).toEqual([expect.stringContaining("status of 404")]);
});

test("the API answers 404 for someone else's transfer", async ({ request }) => {
  const response = await request.get("/api/wallet/transfers/seed-tx01");
  expect(response.status()).toBe(404);
  expect((await response.json()).error.code).toBe("not_found");
});

test("her own receipt opens, signed from her side", async ({ page }) => {
  await page.goto("/wallet/transactions/seed-tx02");
  await expect(
    page.getByRole("heading", { level: 1, name: "Receipt" })
  ).toBeVisible();
  await expect(page.getByText("Tip on @illlhanozkan's Tweet")).toBeVisible();
  await expect(page.getByText("sent 2.00 credits")).toBeAttached();
});
