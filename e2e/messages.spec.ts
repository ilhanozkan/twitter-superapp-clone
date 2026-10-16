import { APIRequestContext, expect, Page, test } from "@playwright/test";

import {
  expectNoHorizontalScroll,
  expectNoSeriousViolations,
  features,
  idempotencyKey,
  setTheme,
  topUp,
  unique,
  watchConsole,
  WIDTHS,
} from "./helpers";

// Direct Messages as the demo user: the inbox, conversations, paying and
// requesting in chat, Tweet shares and /messages?to=. seed-req01 (Sarah's
// request for 4.50 credits) is this spec's to pay (§14.6).

const SARAH = "dm-illlhanozkan-sarahcodes";
const MARCO = "dm-devmarco-illlhanozkan";
const conversationPath = (id: string) => `/messages/${id}`;

test.beforeEach(async ({ request }) => {
  test.skip(!(await features(request)).messages, "Messages is off");
});

async function available(request: APIRequestContext): Promise<number> {
  const response = await request.get("/api/wallet");
  expect(response.status()).toBe(200);
  return (await response.json()).wallet.available;
}

async function skipWithoutWallet(request: APIRequestContext) {
  test.skip(!(await features(request)).wallet, "The wallet is off");
}

/** The first of `usernames` the demo user has no conversation with. */
async function firstWithout(
  request: APIRequestContext,
  usernames: string[]
): Promise<string | null> {
  for (const username of usernames) {
    const id = `dm-illlhanozkan-${username}`;
    const response = await request.get(`/api/conversations/${id}`);
    if (response.status() === 404) return username;
  }
  return null;
}

const log = (page: Page, name: string) =>
  page.getByRole("log", { name: `Messages with ${name}` });

test("pages render without errors", async ({ page }) => {
  const problems = watchConsole(page);
  for (const [path, heading] of [
    ["/messages", "Messages"],
    [conversationPath(MARCO), "Marco Rossi"],
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: heading })
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
  }
  expect(problems).toEqual([]);
});

test("the badge counts Sarah's request; paying it in chat shows Paid and spends 4.50", async ({
  page,
  request,
}) => {
  await skipWithoutWallet(request);
  const seeded = await request.get("/api/wallet/requests/seed-req01");
  test.skip(
    (await seeded.json()).request?.status !== "pending",
    "seed-req01 was answered on this reused server"
  );
  await topUp(request, 450);
  const before = await available(request);

  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await nav
    .getByRole("link", { name: "Messages, 1 unread conversation" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Messages" })
  ).toBeVisible();

  const row = page
    .getByRole("region", { name: "Conversations" })
    .getByRole("link", { name: /Sarah Chen/ });
  await expect(row).toContainText("unread");
  await row.click();
  await expect(page).toHaveURL(new RegExp(`${conversationPath(SARAH)}$`));

  const chat = log(page, "Sarah Chen");
  const bubble = chat.getByText("Sarah Chen requested 4.50 credits");
  await expect(bubble).toBeVisible();
  // Opening the conversation reads it: the badge goes.
  await expect(
    nav.getByRole("link", { name: "Messages", exact: true })
  ).toBeVisible();

  // On a phone the money controls are at least 44px tall (§17).
  await page.setViewportSize({ width: 390, height: 844 });
  for (const control of [
    chat.getByRole("button", { name: "Pay 4.50" }),
    chat.getByRole("button", { name: "Decline request" }),
    page.getByRole("button", { name: "Send credits" }),
  ]) {
    await expect(control).toBeVisible();
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }

  await chat.getByRole("button", { name: "Pay 4.50" }).click();
  const sheet = page.getByRole("dialog", { name: "Pay request" });
  const confirm = sheet.getByRole("button", {
    name: "Pay 4.50 credits to Sarah Chen",
  });
  await expect(confirm).toBeFocused();
  await confirm.click();
  await expect(sheet).toBeHidden();

  await expect(chat.getByText("Paid", { exact: true })).toBeVisible();
  // Pay is gone; focus lands on the request, not the top of the page.
  await expect(
    chat
      .getByRole("listitem")
      .filter({ hasText: "Sarah Chen requested 4.50 credits" })
      .locator('[tabindex="-1"]')
  ).toBeFocused();
  await expect(chat.getByRole("button", { name: "Pay 4.50" })).toHaveCount(0);
  expect(await available(request)).toBe(before - 450);

  // The request record changed, so a fresh read shows it too.
  await page.reload();
  await expect(
    log(page, "Sarah Chen").getByText("Paid", { exact: true })
  ).toBeVisible();
});

test("sending credits in chat posts a payment card and spends them", async ({
  page,
  request,
}) => {
  await skipWithoutWallet(request);
  await topUp(request, 200);
  const before = await available(request);
  const note = unique("Lunch");

  await page.goto(conversationPath(MARCO));
  await page.getByRole("button", { name: "Send credits" }).click();
  const sheet = page.getByRole("dialog", { name: "Send credits" });
  await sheet.getByRole("button", { name: "2.00" }).click();
  await sheet.getByLabel("Note (optional)").fill(note);
  await sheet.getByRole("button", { name: "Review" }).click();
  await sheet
    .getByRole("button", { name: "Send 2.00 credits to Marco Rossi" })
    .click();
  await expect(sheet).toBeHidden();

  const chat = log(page, "Marco Rossi");
  const card = chat.getByRole("listitem").filter({ hasText: note });
  await expect(card).toContainText("You sent 2.00 credits");
  await expect(card.getByRole("link", { name: "View receipt" })).toBeVisible();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "You sent Marco Rossi 2.00 credits" })
  ).toBeVisible();
  expect(await available(request)).toBe(before - 200);
});

test("requesting credits in chat posts a pending request, nothing spent", async ({
  page,
  request,
}) => {
  await skipWithoutWallet(request);
  const before = await available(request);
  const note = unique("Tickets");

  await page.goto(conversationPath(MARCO));
  await page.getByRole("button", { name: "Send or request credits" }).click();
  await page.getByRole("menuitem", { name: "Request credits" }).click();
  const sheet = page.getByRole("dialog", { name: "Request credits" });
  await sheet.getByLabel("Amount in credits").fill("3");
  await sheet.getByLabel("Note (optional)").fill(note);
  await sheet.getByRole("button", { name: "Review" }).click();
  await sheet
    .getByRole("button", { name: "Request 3.00 credits from Marco Rossi" })
    .click();
  await expect(sheet).toBeHidden();

  const card = log(page, "Marco Rossi")
    .getByRole("listitem")
    .filter({ hasText: note });
  await expect(card).toContainText(
    "You requested 3.00 credits from Marco Rossi"
  );
  await expect(card.getByText("Pending", { exact: true })).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Cancel request" })
  ).toBeVisible();
  expect(await available(request)).toBe(before);
});

test("a Tweet shared via Direct Message shows as a card in the conversation", async ({
  page,
}) => {
  const comment = unique("Worth a read");
  await page.goto("/sarahcodes/status/seed-t17");
  await page
    .getByRole("article")
    .first()
    .getByRole("button", { name: "More options" })
    .click();
  await page.getByRole("menuitem", { name: "Send via Direct Message" }).click();

  const dialog = page.getByRole("dialog", { name: "Send Tweet" });
  await expect(dialog).toContainText("semantic color tokens");
  await dialog.getByRole("combobox", { name: "To" }).fill("devmarco");
  await dialog.getByRole("option", { name: /Marco Rossi/ }).click();
  await dialog.getByLabel("Add a comment (optional)").fill(comment);
  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(dialog).toBeHidden();

  await page
    .getByRole("status")
    .filter({ hasText: "Sent to Marco Rossi" })
    .getByRole("link", { name: "View" })
    .click();
  await expect(page).toHaveURL(new RegExp(`${conversationPath(MARCO)}$`));
  const shared = log(page, "Marco Rossi")
    .getByRole("listitem")
    .filter({ hasText: comment });
  await expect(
    shared.getByRole("link", { name: /Shared Tweet by Sarah Chen/ })
  ).toHaveAttribute("href", "/sarahcodes/status/seed-t17");
});

test("/messages?to= redirects to an existing conversation (307)", async ({
  page,
  request,
}) => {
  const response = await request.get("/messages?to=devmarco", {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe(conversationPath(MARCO));

  // The profile's Message button and the Tweet menu link there too.
  await page.goto("/devmarco");
  await page.getByRole("link", { name: "Message Marco Rossi" }).click();
  await expect(page).toHaveURL(new RegExp(`${conversationPath(MARCO)}$`));
  await expect(
    page.getByRole("heading", { level: 1, name: "Marco Rossi" })
  ).toBeVisible();

  await page.goto("/devmarco/status/seed-t04");
  await page
    .getByRole("article")
    .first()
    .getByRole("button", { name: "More options" })
    .click();
  await page.getByRole("menuitem", { name: "Message @devmarco" }).click();
  await expect(page).toHaveURL(new RegExp(`${conversationPath(MARCO)}$`));
});

test("/messages?to= shows a draft that only the first send creates", async ({
  page,
  request,
}) => {
  // nightowl_dev on a fresh server; someone else when a reused server
  // already has that conversation.
  const username = await firstWithout(request, [
    "nightowl_dev",
    "lenaframes",
    "foodie_ankara",
    "canwheels",
  ]);
  test.skip(!username, "Every candidate already has a conversation here");
  const id = `dm-illlhanozkan-${username}`;
  const { fullname } = (
    await (await request.get(`/api/users/${username}`)).json()
  ).user;

  const response = await page.goto(`/messages?to=${username}`);
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(`/messages\\?to=${username}$`));
  await expect(
    page.getByRole("heading", { name: `Say hi to ${fullname} 👋` })
  ).toBeVisible();
  // GET never writes.
  expect((await request.get(`/api/conversations/${id}`)).status()).toBe(404);
  const inbox = await (await request.get("/api/conversations")).json();
  expect(inbox.items.map((item: { id: string }) => item.id)).not.toContain(id);

  const text = unique("Hello");
  await page.getByRole("textbox", { name: `Message ${fullname}` }).fill(text);
  await page.keyboard.press("Enter");
  const chat = log(page, fullname);
  await expect(chat.getByText(text)).toBeVisible();
  await expect(chat.getByText("Sending…")).toHaveCount(0);

  const created = await request.get(`/api/conversations/${id}/messages`);
  expect(created.status()).toBe(200);
  expect(
    (await created.json()).items.map(
      (message: { body: { text?: string } }) => message.body.text
    )
  ).toContain(text);

  // From now on ?to= finds it.
  await page.goto(`/messages?to=${username}`);
  await expect(page).toHaveURL(new RegExp(`${conversationPath(id)}$`));
});

test("?to= with an unknown person or yourself shows a not-found state", async ({
  page,
}) => {
  for (const [to, title] of [
    ["ghost_user", "This account doesn’t exist"],
    ["illlhanozkan", "You can’t message yourself"],
  ]) {
    const response = await page.goto(`/messages?to=${to}`);
    expect(response?.status(), to).toBe(404);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
});

test("someone else's conversation is a 404", async ({ page, request }) => {
  const id = "dm-ayse_design-sarahcodes";
  expect((await page.goto(conversationPath(id)))?.status()).toBe(404);
  expect((await request.get(`/api/conversations/${id}`)).status()).toBe(404);
});

test.describe("reading and retrying", () => {
  test("Load older keeps your place in the conversation", async ({
    page,
    request,
  }) => {
    // More than a page (30): the newest 30 are #6 to #35.
    const tag = unique("Older");
    for (let i = 1; i <= 35; i++) {
      const response = await request.post(
        `/api/conversations/${MARCO}/messages`,
        {
          headers: { "Idempotency-Key": idempotencyKey() },
          data: { text: `${tag} #${i}` },
        }
      );
      expect(response.status()).toBe(201);
    }
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(conversationPath(MARCO));
    const chat = log(page, "Marco Rossi");
    const row = (n: number) =>
      chat.getByRole("listitem").filter({ hasText: `${tag} #${n}` });
    await expect(row(35)).toBeVisible();

    // Up to the top, where the oldest loaded message is in view.
    await chat.evaluate((element) => {
      element.scrollTop = -element.scrollHeight;
    });
    await expect(row(6)).toBeInViewport();
    const before = (await row(6).boundingBox())!.y;

    await chat.getByRole("button", { name: "Load older messages" }).click();
    await expect(row(5)).toHaveCount(1);
    expect(Math.abs((await row(6).boundingBox())!.y - before)).toBeLessThan(2);
  });

  test("a message's time shows while the conversation has keyboard focus", async ({
    page,
  }) => {
    await page.goto(conversationPath(SARAH));
    const chat = log(page, "Sarah Chen");
    // A text without links: nothing inside it to focus.
    const time = chat
      .getByRole("listitem")
      .filter({ hasText: "Friday coffee at Kızılay Kahve?" })
      .locator("span:has(> time)");
    expect((await time.boundingBox())!.width).toBeLessThanOrEqual(1);

    for (let tab = 0; tab < 60; tab++) {
      if (await chat.evaluate((element) => element === document.activeElement))
        break;
      await page.keyboard.press("Tab");
    }
    await expect(chat).toBeFocused();
    expect((await time.boundingBox())!.width).toBeGreaterThan(1);
  });

  test("Retry keeps focus in the conversation", async ({ page }) => {
    await page.goto(conversationPath(MARCO));
    let fail = true;
    await page.route(`**/api/conversations/${MARCO}/messages`, (route) =>
      fail && route.request().method() === "POST"
        ? route.abort()
        : route.continue()
    );
    const text = unique("Will fail first");
    await page.getByRole("textbox", { name: "Message Marco Rossi" }).fill(text);
    await page.keyboard.press("Enter");

    const chat = log(page, "Marco Rossi");
    const retry = chat.getByRole("button", { name: "Retry" });
    await expect(retry).toBeVisible();
    fail = false;
    await retry.focus();
    await page.keyboard.press("Enter");
    await expect(chat.getByText("Not sent")).toHaveCount(0);
    await expect(chat.getByText("Sending…")).toHaveCount(0);
    await expect(chat).toBeFocused();
  });
});

test.describe("layout", () => {
  test("two panes at 1280: the list beside the conversation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/messages");
    await expect(
      page.getByRole("heading", { name: "Select a message" })
    ).toBeVisible();

    await page
      .getByRole("region", { name: "Conversations" })
      .getByRole("link", { name: /Marco Rossi/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`${conversationPath(MARCO)}$`));
    const list = page.getByRole("region", { name: "Conversations" });
    const chat = log(page, "Marco Rossi");
    await expect(list).toBeVisible();
    await expect(chat).toBeVisible();
    await expect(
      list.getByRole("link", { name: /Marco Rossi/ })
    ).toHaveAttribute("aria-current", "page");

    const [listBox, chatBox] = [
      await list.boundingBox(),
      await chat.boundingBox(),
    ];
    // The list's column is 390px (its border included), the chat beside it.
    expect(Math.round(chatBox!.x - listBox!.x)).toBe(390);
    // No right column on this wide page.
    await expect(
      page.getByRole("complementary", { name: "Search and trends" })
    ).toBeHidden();
  });

  test("focus mode at 390: no tab bar, the composer stays in view", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/messages");
    const tabs = page.getByRole("navigation", { name: "Primary" });
    await expect(tabs).toBeVisible();

    await page
      .getByRole("region", { name: "Conversations" })
      .getByRole("link", { name: /Marco Rossi/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`${conversationPath(MARCO)}$`));
    await expect(tabs).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Compose a Tweet" })
    ).toHaveCount(0);
    const composer = page.getByRole("textbox", { name: "Message Marco Rossi" });
    await expect(composer).toBeInViewport();
    await expect(
      page.getByRole("region", { name: "Conversations" })
    ).toBeHidden();

    await page.getByRole("link", { name: "Back to Messages" }).click();
    await expect(page).toHaveURL(/\/messages$/);
    await expect(tabs).toBeVisible();
  });
});

test.describe("accessibility (axe)", () => {
  // Seven full axe passes over three page loads (one of them Marco's log,
  // grown by the tests above) take most of the default 30 s on a slow runner.
  test.slow();

  for (const theme of ["light", "dark"] as const) {
    test(`the inbox, a conversation and the dialogs in ${theme} mode`, async ({
      page,
      request,
    }) => {
      await setTheme(page, theme);
      await page.goto("/messages");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.waitForLoadState("networkidle");
      await expectNoSeriousViolations(page);

      await page.getByRole("button", { name: "New message" }).first().click();
      const dialog = page.getByRole("dialog", { name: "New message" });
      await expect(dialog.getByRole("combobox", { name: "To" })).toBeFocused();
      await expectNoSeriousViolations(page);
      await dialog.getByRole("button", { name: "Close" }).click();
      await expect(dialog).toBeHidden();

      for (const id of [SARAH, MARCO]) {
        await page.goto(conversationPath(id));
        await page.waitForLoadState("networkidle");
        await expectNoSeriousViolations(page);
      }

      // Over the limit, the count under the field turns red.
      const composer = page.getByRole("textbox", {
        name: "Message Marco Rossi",
      });
      await composer.fill("x".repeat(1_003));
      await expect(
        page.locator("p", { hasText: "3 characters over the limit" })
      ).toBeVisible();
      await expectNoSeriousViolations(page);
      await composer.fill("");

      if ((await features(request)).wallet) {
        await page.getByRole("button", { name: "Send credits" }).click();
        const sheet = page.getByRole("dialog", { name: "Send credits" });
        const five = sheet.getByRole("button", { name: "5.00" });
        await five.click();
        await expect(five).toHaveAttribute("aria-pressed", "true");
        await page.mouse.move(0, 0);
        await expectNoSeriousViolations(page);
        await sheet.getByRole("button", { name: "Review" }).click();
        await expect(
          sheet.getByRole("button", { name: /^Send 5.00 credits/ })
        ).toBeFocused();
        await expectNoSeriousViolations(page);
      }
    });
  }
});

test.describe("responsive layout", () => {
  for (const width of WIDTHS) {
    test(`no horizontal scrolling at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of [
        "/messages",
        conversationPath(SARAH),
        conversationPath(MARCO),
        "/messages?to=ayse_design",
        "/messages?to=superapp",
      ]) {
        await page.goto(path);
        await expectNoHorizontalScroll(page, `${path} at ${width}px`);
      }
    });
  }
});
