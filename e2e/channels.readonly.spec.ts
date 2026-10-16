import { expect, test } from "@playwright/test";

import { features, idempotencyKey, watchConsole } from "./helpers";

// A READ_ONLY=true deployment: channels can be read, never written.

const BUILDERS = "superapp_builders";

test.beforeEach(async ({ request }) => {
  test.skip(!(await features(request)).channels, "Channels is off");
});

test("channels can be read, with no Join, Create or composer", async ({
  page,
}) => {
  const problems = watchConsole(page);
  await page.goto("/channels?tab=discover");
  await expect(
    page.getByRole("article", { name: "Ankara eats" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Join/ })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create channel" })
  ).toHaveCount(0);

  await page.goto(`/channels/${BUILDERS}`);
  await expect(
    page.getByText("Messaging is turned off on this read-only demo.")
  ).toBeVisible();
  const chat = page.getByRole("log", { name: `Messages in #${BUILDERS}` });
  await expect(chat.getByText("Channels are live!")).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(Join|Leave)/ })).toHaveCount(
    0
  );
  await expect(
    chat.getByRole("button", { name: "Delete message" })
  ).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  expect(problems).toEqual([]);
});

test("every write is refused with 403", async ({ request }) => {
  const writes = [
    request.post("/api/channels", {
      data: { handle: "read_only_room", name: "Nope" },
    }),
    request.put("/api/channels/ankara_eats/membership"),
    request.delete(`/api/channels/${BUILDERS}/membership`),
    request.put(`/api/channels/${BUILDERS}/members/sarahcodes/role`, {
      data: { role: "moderator" },
    }),
    request.post(`/api/channels/${BUILDERS}/messages`, {
      headers: { "Idempotency-Key": idempotencyKey() },
      data: { text: "Hello" },
    }),
    request.delete(`/api/channels/${BUILDERS}/messages/seed-msg-sab-04`),
    request.put(`/api/channels/${BUILDERS}/read`),
  ];
  for (const response of await Promise.all(writes)) {
    expect(response.status(), response.url()).toBe(403);
    expect((await response.json()).error.code).toBe("read_only");
  }
});
