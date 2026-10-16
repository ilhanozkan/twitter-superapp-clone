import { expect, test } from "@playwright/test";

import { features, watchConsole } from "./helpers";

// DEMO_USERNAME=sarahcodes runs no business: the Business page and the
// switches are not there for her.

test.beforeEach(async ({ request }) => {
  test.skip(!(await features(request)).shop, "The shop is off");
});

test("the Business page is a 404 page", async ({ page }) => {
  const problems = watchConsole(page);
  const response = await page.goto("/business");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: "Page not found" })
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Business" })
  ).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  // Chrome logs the document's own 404 status as a console error.
  expect(problems).toEqual([expect.stringContaining("status of 404")]);
});

test("the switches answer 404 for a business she doesn't run", async ({
  request,
}) => {
  const availability = await request.put(
    "/api/products/seed-p-sa-mug/availability",
    { data: { available: false } }
  );
  expect(availability.status()).toBe(404);
  expect((await availability.json()).error.code).toBe("not_found");

  const settings = await request.put("/api/businesses/superapp/settings", {
    data: { acceptingOrders: false },
  });
  expect(settings.status()).toBe(404);
});

test("her product picker says where products come from", async ({
  page,
  request,
}) => {
  // Once orders ship, what she ordered is offered too (she has an order).
  test.skip((await features(request)).orders, "Her orders fill the picker");
  await page.goto("/");
  await page
    .getByRole("main")
    .getByRole("button", { name: "Attach a product" })
    .click();
  const picker = page.getByRole("dialog", { name: "Attach a product" });
  await expect(
    picker.getByText(
      "Products from businesses you manage or have ordered from appear here."
    )
  ).toBeVisible();
  await picker.getByRole("link", { name: "Browse Food" }).click();
  await expect(page).toHaveURL(/\/food$/);
  await expect(picker).toBeHidden();
});
