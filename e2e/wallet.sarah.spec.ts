import { expect, test } from "@playwright/test";

import { idempotencyKey, unique } from "./helpers";

// DEMO_USERNAME=sarahcodes: the other side of a request. seed-req01 (Sarah
// asks the demo user for 4.50) is cancelled by messages.sarah.spec.ts
// (§14.6), so this spec only looks at it, and cancels a request of its own.

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
