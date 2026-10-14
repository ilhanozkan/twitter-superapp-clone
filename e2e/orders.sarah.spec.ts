import { expect, test } from "@playwright/test";

import { features } from "./helpers";

// DEMO_USERNAME=sarahcodes: her own order (seed-o02, from @superapp) and
// nobody else's.

test.beforeEach(async ({ request }) => {
  test.skip(!(await features(request)).orders, "Orders are off");
});

test("she sees her order, with Order again and no business tools", async ({
  page,
}) => {
  await page.goto("/orders");
  const past = page.getByRole("region", { name: "Past" });
  await past.getByRole("link", { name: "Twitter SuperApp · #P4R8" }).click();
  await expect(page).toHaveURL(/\/orders\/seed-o02$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Order #P4R8 from Twitter SuperApp",
    })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Order again" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Cancel/ })).toHaveCount(0);
});

test("other people's orders are not found", async ({ page, request }) => {
  for (const id of ["seed-o01", "seed-o03"]) {
    expect((await page.goto(`/orders/${id}`))?.status()).toBe(404);
    expect((await request.get(`/api/orders/${id}`)).status()).toBe(404);
  }
  const board = await request.get("/api/orders?as=business&business=superapp");
  expect(board.status()).toBe(404);
});

test("her product picker offers what she ordered", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("main")
    .getByRole("button", { name: "Attach a product" })
    .click();
  const picker = page.getByRole("dialog", { name: "Attach a product" });
  await expect(
    picker.getByRole("button", { name: /Sticker pack/ })
  ).toBeVisible();
});
