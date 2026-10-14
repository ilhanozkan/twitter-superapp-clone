import { expect, test } from "@playwright/test";

import { features } from "./helpers";

// DEMO_USERNAME=sarahcodes, on her own server: the requester's side of
// seed-req01 (§14.6: this spec cancels it), and conversations she isn't in.

const WITH_DEMO = "dm-illlhanozkan-sarahcodes";

test.beforeEach(async ({ request }) => {
  test.skip(!(await features(request)).messages, "Messages is off");
});

test("Sarah sees her request as hers and cancels it in the chat", async ({
  page,
  request,
}) => {
  test.skip(!(await features(request)).wallet, "The wallet is off");
  const seeded = await request.get("/api/wallet/requests/seed-req01");
  test.skip(
    (await seeded.json()).request?.status !== "pending",
    "seed-req01 was answered on this reused server"
  );

  await page.goto(`/messages/${WITH_DEMO}`);
  const chat = page.getByRole("log", { name: "Messages with Ilhan Ozkan" });
  const bubble = chat
    .getByRole("listitem")
    .filter({ hasText: "You requested 4.50 credits from Ilhan Ozkan" });
  await expect(bubble).toContainText("Coffee ☕");
  // The requester can't pay her own request.
  await expect(bubble.getByRole("button", { name: /^Pay/ })).toHaveCount(0);

  await bubble.getByRole("button", { name: "Cancel request" }).click();
  await expect(bubble.getByText("Cancelled", { exact: true })).toBeVisible();
  await expect(
    bubble.getByRole("button", { name: "Cancel request" })
  ).toHaveCount(0);
  expect(
    (await (await request.get("/api/wallet/requests/seed-req01")).json())
      .request.status
  ).toBe("cancelled");
});

test("the demo user's conversation with Marco is a 404 for her", async ({
  page,
  request,
}) => {
  const id = "dm-devmarco-illlhanozkan";
  expect((await page.goto(`/messages/${id}`))?.status()).toBe(404);
  expect((await request.get(`/api/conversations/${id}`)).status()).toBe(404);
  expect(
    (await request.get(`/api/conversations/${id}/messages`)).status()
  ).toBe(404);
});
