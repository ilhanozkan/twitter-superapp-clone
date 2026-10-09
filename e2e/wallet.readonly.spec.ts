import { expect, test } from "@playwright/test";

import { watchConsole } from "./helpers";

// READ_ONLY=true: balances and requests show, but nothing that moves
// credits can be started.

test("the wallet has no money actions, and requests say why they can't be answered", async ({
  page,
}) => {
  const problems = watchConsole(page);
  await page.goto("/wallet");
  await expect(
    page.getByText("Payments are turned off on this read-only demo.")
  ).toBeVisible();

  const balance = page.getByRole("region", { name: "Balance" });
  await expect(balance).toContainText("credits");
  await expect(balance.getByRole("button")).toHaveCount(0);

  const requests = page.getByRole("region", { name: "Requests for you" });
  const pay = requests.getByRole("button", { name: /^Pay / }).first();
  await expect(pay).toBeDisabled();
  await expect(
    requests.getByRole("button", { name: /^Decline / }).first()
  ).toBeDisabled();
  await expect(requests).toContainText(
    "Paying and declining are off on this read-only demo."
  );

  await page.waitForLoadState("networkidle");
  expect(problems).toEqual([]);
});

test("the right column's wallet card shows the balance only", async ({
  page,
}) => {
  await page.goto("/");
  const card = page.getByRole("region", { name: "Wallet" });
  await expect(card).toContainText("credits");
  await expect(card.getByRole("button")).toHaveCount(0);
});
