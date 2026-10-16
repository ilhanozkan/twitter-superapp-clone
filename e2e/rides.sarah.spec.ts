import { expect, test } from "@playwright/test";

import { features, watchConsole } from "./helpers";

// DEMO_USERNAME=sarahcodes: a ride is visible to its rider and its driver
// only. seed-ride01 is the demo user's trip with Ahmet.

test.beforeEach(async ({ request }) => {
  test.skip(!(await features(request)).rides, "Rides is off on this server");
});

test("someone else's ride is a 404 page", async ({ page }) => {
  const problems = watchConsole(page);
  const response = await page.goto("/rides/seed-ride01");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: "Page not found" })
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  // Chrome logs the document's own 404 status as a console error.
  expect(problems).toEqual([expect.stringContaining("status of 404")]);
});

test("the API answers 404 for someone else's ride", async ({ request }) => {
  const response = await request.get("/api/rides/seed-ride01");
  expect(response.status()).toBe(404);
  expect((await response.json()).error.code).toBe("not_found");
});

test("her own rides list doesn't include it", async ({ page }) => {
  await page.goto("/rides");
  const recent = page.getByRole("region", { name: "Recent rides" });
  await expect(recent).toBeVisible();
  await expect(
    recent.getByRole("link", { name: /Bahçelievler to Atakule/ })
  ).toHaveCount(0);
});
