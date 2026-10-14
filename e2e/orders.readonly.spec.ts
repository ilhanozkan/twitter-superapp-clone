import { expect, test } from "@playwright/test";

import { features, idempotencyKey, watchConsole } from "./helpers";

// A READ_ONLY=true deployment: orders and the Business board show, nothing
// can be placed, cancelled or simulated, and each control says why.

test.beforeEach(async ({ request }) => {
  test.skip(!(await features(request)).orders, "Orders are off");
});

test("Order now on a product card is disabled with the reason", async ({
  page,
}) => {
  await page.goto("/kizilaykahve/status/seed-t22");
  const order = page
    .getByRole("group", { name: "Product: Pistachio latte" })
    .getByRole("button", { name: "Order now" });
  await expect(order).toBeDisabled();
  await expect(order).toHaveAccessibleDescription(
    "Ordering is turned off on this read-only demo"
  );
});

test("checkout shows the cart but won't place it", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "cart:v1",
      JSON.stringify({
        business: { username: "kizilaykahve", fullname: "Kızılay Kahve" },
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
  });
  const problems = watchConsole(page);
  await page.goto("/checkout");
  const place = page.getByRole("button", { name: /^Place order/ });
  await expect(place).toHaveAttribute("aria-disabled", "true");
  await expect(place).toHaveAccessibleDescription(
    "Ordering is turned off on this read-only demo."
  );
  // aria-disabled keeps it focusable; a click does nothing.
  await place.dispatchEvent("click");
  await expect(page).toHaveURL(/\/checkout$/);
  await page.waitForLoadState("networkidle");
  expect(problems).toEqual([]);
});

test("the order page has no cancel, the board's controls say why", async ({
  page,
}) => {
  await page.goto("/orders/seed-o01");
  await expect(
    page.getByRole("heading", { level: 2, name: /^Delivered at/ })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tweet about it" })
  ).toHaveCount(0);

  await page.goto("/business");
  const reason = "Changes are turned off on this read-only demo.";
  // seed-o03 is still on its way (this server runs at scale 1).
  for (const name of [
    "Cancel & refund #M2X9",
    "Simulate a customer order · Demo bot",
  ]) {
    const button = page.getByRole("button", { name });
    await expect(button).toHaveAttribute("aria-disabled", "true");
    await expect(button).toHaveAccessibleDescription(reason);
  }
  await page
    .getByRole("button", { name: "Cancel & refund #M2X9" })
    .dispatchEvent("click");
  await expect(
    page.getByRole("dialog", { name: "Cancel and refund?" })
  ).toBeHidden();
});

test("the orders API refuses writes", async ({ request }) => {
  const place = await request.post("/api/orders", {
    headers: { "Idempotency-Key": idempotencyKey() },
    data: {
      business: "kizilaykahve",
      items: [{ productId: "seed-p-kk-latte", quantity: 1 }],
      deliveryPlaceId: "tunali",
      expectedTotal: 650,
    },
  });
  expect(place.status()).toBe(403);
  expect((await place.json()).error.code).toBe("read_only");

  const cancel = await request.post("/api/orders/seed-o03/cancel", {
    data: { as: "business" },
  });
  expect(cancel.status()).toBe(403);

  const demo = await request.post("/api/businesses/superapp/demo-orders", {
    headers: { "Idempotency-Key": idempotencyKey() },
  });
  expect(demo.status()).toBe(403);
});
