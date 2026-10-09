import { expect, test } from "@playwright/test";

import { features, watchConsole } from "./helpers";

// A READ_ONLY=true deployment: menus and product cards show, nothing changes.

test.beforeEach(async ({ request }) => {
  test.skip(!(await features(request)).shop, "The shop is off");
});

test("the Business page's switches are disabled with the reason", async ({
  page,
}) => {
  const problems = watchConsole(page);
  await page.goto("/business");
  const reason = "Changes are turned off on this read-only demo.";
  await expect(page.getByText(reason)).toBeVisible();
  for (const name of ["Accepting orders", "SuperApp mug"]) {
    const toggle = page.getByRole("switch", { name });
    await expect(toggle).toBeDisabled();
    await expect(toggle).toHaveAccessibleDescription(reason);
  }
  await page.waitForLoadState("networkidle");
  expect(problems).toEqual([]);
});

test("availability can't be changed", async ({ request }) => {
  const response = await request.put(
    "/api/products/seed-p-sa-mug/availability",
    { data: { available: false } }
  );
  expect(response.status()).toBe(403);
  expect((await response.json()).error.code).toBe("read_only");
});

test("menus and product cards still show", async ({ page }) => {
  await page.goto("/kizilaykahve/status/seed-t22");
  const card = page.getByRole("group", { name: "Product: Pistachio latte" });
  await expect(card).toContainText("5.00 credits");
  await card.getByRole("link", { name: "View menu" }).click();
  await expect(page).toHaveURL(/\/kizilaykahve\/menu$/);
  await expect(
    page.getByRole("heading", { level: 2, name: "Coffee" })
  ).toBeVisible();
});
