import { expect, test } from "@playwright/test";

import { watchConsole } from "./helpers";

// READ_ONLY=true: balances, requests and tip counts show, but nothing that
// moves credits can be started.

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

test("Tip is disabled, and nothing offers to send credits", async ({
  page,
}) => {
  const problems = watchConsole(page);
  await page.goto("/sarahcodes");
  const card = page
    .locator("main article")
    .filter({ hasText: "Hot take: every icon-only button" });
  await expect(card.getByRole("button", { name: /^Tip/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /^Send credits/ })).toHaveCount(
    0
  );

  // Other features may still have menu items here; the wallet adds none.
  const more = card.getByRole("button", { name: "More options" });
  if (await more.count()) {
    await more.click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: /^Send credits/ })
    ).toHaveCount(0);
  }

  await page.goto("/");
  const tips = page.getByRole("button", { name: /^Tip/ });
  await expect(tips.first()).toBeVisible();
  for (const tip of await tips.all()) await expect(tip).toBeDisabled();
  expect(problems).toEqual([]);
});
