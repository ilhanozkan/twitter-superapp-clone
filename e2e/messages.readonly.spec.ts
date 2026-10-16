import { expect, test } from "@playwright/test";

import { features, idempotencyKey, watchConsole } from "./helpers";

// A READ_ONLY=true deployment: conversations can be read, never written.

const SARAH = "dm-illlhanozkan-sarahcodes";

test.beforeEach(async ({ request }) => {
  test.skip(!(await features(request)).messages, "Messages is off");
});

test("a conversation replaces the composer and offers no actions", async ({
  page,
  request,
}) => {
  const problems = watchConsole(page);
  await page.goto(`/messages/${SARAH}`);
  await expect(
    page.getByText("Messaging is turned off on this read-only demo.")
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^Message/ })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Send or request credits" })
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send credits" })).toHaveCount(
    0
  );

  const chat = page.getByRole("log", { name: "Messages with Sarah Chen" });
  await expect(
    chat.getByText("Sarah Chen requested 4.50 credits")
  ).toBeVisible();
  await expect(chat.getByRole("button")).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  expect(problems).toEqual([]);

  // Reading never marks it read here: the badge still counts it.
  expect(
    (await (await request.get("/api/activity")).json()).unreadConversations
  ).toBe(1);
});

test("the Tweet menu has no Send via Direct Message", async ({ page }) => {
  await page.goto("/devmarco/status/seed-t04");
  await page
    .getByRole("article")
    .first()
    .getByRole("button", { name: "More options" })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Message @devmarco" })
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Send via Direct Message" })
  ).toHaveCount(0);
});

test("every write is refused with 403", async ({ request }) => {
  const writes = [
    request.post("/api/conversations", { data: { with: "nightowl_dev" } }),
    request.post(`/api/conversations/${SARAH}/messages`, {
      headers: { "Idempotency-Key": idempotencyKey() },
      data: { text: "Hello" },
    }),
    request.post(`/api/conversations/${SARAH}/payments`, {
      headers: { "Idempotency-Key": idempotencyKey() },
      data: { amount: 100 },
    }),
    request.post(`/api/conversations/${SARAH}/requests`, {
      headers: { "Idempotency-Key": idempotencyKey() },
      data: { amount: 100 },
    }),
    request.put(`/api/conversations/${SARAH}/read`),
  ];
  for (const response of await Promise.all(writes)) {
    expect(response.status(), response.url()).toBe(403);
    expect((await response.json()).error.code).toBe("read_only");
  }
});
