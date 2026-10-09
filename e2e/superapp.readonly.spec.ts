import { expect, test } from "@playwright/test";

import { idempotencyKey, watchConsole } from "./helpers";

// A READ_ONLY=true deployment: balances show, money never moves.

test("the wallet says payments are off and offers no actions", async ({
  page,
}) => {
  const problems = watchConsole(page);
  await page.goto("/wallet");
  await expect(
    page.getByText("Payments are turned off on this read-only demo.")
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Balance" })).toContainText(
    "credits"
  );
  await page.waitForLoadState("networkidle");
  expect(problems).toEqual([]);
});

test("adding credits is refused", async ({ request }) => {
  const response = await request.post("/api/wallet/top-ups", {
    headers: { "Idempotency-Key": idempotencyKey() },
    data: { amount: 2_500 },
  });
  expect(response.status()).toBe(403);
  expect((await response.json()).error.code).toBe("read_only");
});

test("tipping is refused", async ({ request }) => {
  const response = await request.post("/api/tweets/seed-t20/tip", {
    headers: { "Idempotency-Key": idempotencyKey() },
    data: { amount: 100 },
  });
  expect(response.status()).toBe(403);
  expect((await response.json()).error.code).toBe("read_only");
});
