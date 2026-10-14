import { expect, test } from "@playwright/test";

import { features, idempotencyKey, watchConsole } from "./helpers";

// A READ_ONLY=true deployment: rides can be looked at, never booked.

test.beforeEach(async ({ request }) => {
  test.skip(!(await features(request)).rides, "Rides is off on this server");
});

test("the booking form says booking is off, with the reason on the button", async ({
  page,
}) => {
  const problems = watchConsole(page);
  await page.goto("/rides");
  const book = page.getByRole("button", { name: /^Book / });
  await expect(book).toHaveAttribute("aria-disabled", "true");
  await expect(book).toHaveAccessibleDescription(
    "Booking is turned off on this read-only demo."
  );
  // Still focusable and clickable (aria-disabled), but it books nothing.
  await book.click({ force: true });
  await expect(page).toHaveURL(/\/rides$/);
  await page.waitForLoadState("networkidle");
  expect(problems).toEqual([]);
});

test("a completed ride offers no tips", async ({ page }) => {
  await page.goto("/rides/seed-ride01");
  await expect(
    page.getByRole("heading", { level: 2, name: "You’ve arrived" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Tip / })).toHaveCount(0);
});

test("booking is refused", async ({ request }) => {
  const response = await request.post("/api/rides", {
    headers: { "Idempotency-Key": idempotencyKey() },
    data: {
      from: "kizilay",
      to: "atakule",
      type: "economy",
      expectedFare: 630,
    },
  });
  expect(response.status()).toBe(403);
  expect((await response.json()).error.code).toBe("read_only");
});
