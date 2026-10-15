import {
  APIRequestContext,
  expect,
  Locator,
  Page,
  test,
} from "@playwright/test";

import {
  expectNoHorizontalScroll,
  expectNoSeriousViolations,
  features,
  setTheme,
  unique,
  watchConsole,
  WIDTHS,
} from "./helpers";

// Channels as the demo user, who moderates #superapp_builders and hasn't
// joined #ankara_eats. seed-msg-sab-04 (Marco's off-topic message) is this
// spec's to remove (§14.6); everything else it creates itself.

const BUILDERS = "superapp_builders";
const EATS = "ankara_eats";
const channelPath = (handle: string) => `/channels/${handle}`;

test.beforeEach(async ({ request }) => {
  test.skip(!(await features(request)).channels, "Channels is off");
});

const log = (page: Page, handle: string) =>
  page.getByRole("log", { name: `Messages in #${handle}` });

/** A message of the log, by part of its text. */
const messageRow = (page: Page, handle: string, text: string) =>
  log(page, handle).getByRole("listitem").filter({ hasText: text });

/**
 * Fully on screen once scrolled to, without the page scrolling sideways
 * (which `overflow-x: hidden` would otherwise allow a script to do).
 */
async function expectFullyInView(target: Locator, label: string) {
  await target.scrollIntoViewIfNeeded();
  await expect(target, label).toBeInViewport({ ratio: 1 });
  expect(await target.page().evaluate(() => window.scrollX), label).toBe(0);
}

/**
 * The part of `line`'s text matching `pattern` is drawn inside the line's
 * box: not cut off by an ellipsis or by a neighbour squeezing the line.
 */
async function expectTextShown(line: Locator, pattern: RegExp, label: string) {
  const overflow = await line.evaluate((element, source) => {
    const wanted = new RegExp(source);
    const box = element.getBoundingClientRect();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const match = wanted.exec(node.textContent ?? "");
      if (!match) continue;
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      const text = range.getBoundingClientRect();
      return Math.max(text.right - box.right, box.left - text.left);
    }
    return Number.POSITIVE_INFINITY;
  }, pattern.source);
  expect(overflow, label).toBeLessThanOrEqual(0.5);
}

/** The demo user's role in a channel (null: not a member). */
async function roleIn(request: APIRequestContext, handle: string) {
  const response = await request.get(`/api/channels/${handle}`);
  expect(response.status()).toBe(200);
  return (await response.json()).channel.viewer.role as string | null;
}

test("pages render without errors", async ({ page }) => {
  const problems = watchConsole(page);
  for (const [path, heading] of [
    ["/channels", "Channels"],
    [channelPath(BUILDERS), `#${BUILDERS}`],
    [channelPath(EATS), `#${EATS}`],
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

test("the inbox's Channels tab leads to /channels and back", async ({
  page,
  request,
}) => {
  test.skip(!(await features(request)).messages, "Messages is off");
  await page.goto("/messages");
  const tabs = page.getByRole("navigation", { name: "Messages and channels" });
  await tabs.getByRole("link", { name: "Channels" }).click();
  await expect(page).toHaveURL(/\/channels$/);
  await expect(
    page
      .getByRole("navigation", { name: "Messages and channels" })
      .getByRole("link", { name: "Channels" })
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page
      .getByRole("region", { name: "Your channels" })
      .getByRole("article", { name: "SuperApp builders" })
  ).toBeVisible();
});

test("Discover → join #ankara_eats → post → leave", async ({
  page,
  request,
}) => {
  // A reused server may still have the demo user in it.
  await request.delete(`/api/channels/${EATS}/membership`);

  await page.goto("/channels");
  await page
    .getByRole("navigation", { name: "Channel lists" })
    .getByRole("link", { name: "Discover" })
    .click();
  await expect(page).toHaveURL(/\/channels\?tab=discover$/);
  const discover = page.getByRole("region", { name: "Discover" });
  const card = discover.getByRole("article", { name: "Ankara eats" });
  await expect(card).toContainText(`#${EATS}`);
  const before = Number(
    (await card.textContent())!.match(/(\d+) members?/)![1]
  );

  await card.getByRole("button", { name: `Join #${EATS}` }).click();
  await expect(card.getByText("Joined")).toBeVisible();
  // The button went: focus moves to the card's link rather than the page.
  await expect(card.getByRole("link", { name: "Ankara eats" })).toBeFocused();
  await expect(card).toContainText(`${before + 1} members`);
  expect(await roleIn(request, EATS)).toBe("member");

  await card.getByRole("link", { name: "Ankara eats" }).click();
  await expect(page).toHaveURL(new RegExp(`${channelPath(EATS)}$`));
  const text = unique("Simit tour on Saturday?");
  const composer = page.getByRole("textbox", { name: `Message #${EATS}` });
  await composer.fill(text);
  await page.keyboard.press("Enter");
  const chat = log(page, EATS);
  await expect(chat.getByText(text)).toBeVisible();
  await expect(chat.getByText("Sending…")).toHaveCount(0);
  // Everyone else's messages carry their name.
  await expect(chat.getByText("Kızılay Kahve", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: `Leave #${EATS}` }).click();
  await expect(page.getByText("Join to send messages")).toBeVisible();
  await expect(composer).toHaveCount(0);
  // Focus lands on Join, where Leave was.
  await expect(
    page.getByRole("button", { name: `Join #${EATS}` }).first()
  ).toBeFocused();
  expect(await roleIn(request, EATS)).toBeNull();
  // What was posted stays, readable by anyone.
  await expect(chat.getByText(text)).toBeVisible();
});

test("as a moderator, remove seed-msg-sab-04 in #superapp_builders", async ({
  page,
  request,
}) => {
  const seeded = await (
    await request.get(`/api/channels/${BUILDERS}/messages?limit=50`)
  ).json();
  const target = seeded.items.find(
    (message: { id: string }) => message.id === "seed-msg-sab-04"
  );
  test.skip(
    !target || target.body.type === "removed",
    "seed-msg-sab-04 was removed on this reused server"
  );
  expect(await roleIn(request, BUILDERS)).toBe("moderator");

  await page.goto(channelPath(BUILDERS));
  const chat = log(page, BUILDERS);
  const row = chat
    .getByRole("listitem")
    .filter({ hasText: "who wants my old mechanical keyboard" });
  await expect(row).toContainText("Marco Rossi");
  await row.getByRole("button", { name: "Delete message" }).click();

  const dialog = page.getByRole("dialog", { name: "Delete message?" });
  await expect(dialog).toContainText("Message removed by a moderator");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(dialog).toBeHidden();

  await expect(
    chat.getByText("who wants my old mechanical keyboard")
  ).toHaveCount(0);
  await expect(chat.getByText("Message removed by a moderator")).toBeVisible();
  await expect(chat).toBeFocused();

  // For everyone, from the store.
  await page.reload();
  await expect(
    log(page, BUILDERS).getByText("Message removed by a moderator")
  ).toBeVisible();
});

test("create a channel and own it", async ({ page, request }) => {
  const mine = await (await request.get("/api/channels?member=true")).json();
  const owned = mine.items.filter(
    (channel: { viewer: { role: string } }) => channel.viewer.role === "owner"
  );
  test.skip(owned.length >= 3, "The demo user owns 3 channels on this server");

  const name = unique("E2E room");
  const handle = name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  await page.goto("/channels");
  await page.getByRole("button", { name: "Create channel" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create channel" });
  await expect(dialog.getByLabel("Name")).toBeFocused();
  await dialog.getByLabel("Name").fill(name);
  await expect(dialog.getByLabel("Handle")).toHaveValue(handle);
  await dialog.getByLabel(/^Description/).fill("Made by the e2e suite");
  await dialog.getByRole("button", { name: "Create channel" }).click();

  await expect(page).toHaveURL(new RegExp(`${channelPath(handle)}$`));
  await expect(
    page.getByRole("heading", { level: 1, name: `#${handle}` })
  ).toBeVisible();
  await expect(page.getByText(`${name} · 1 member`)).toBeVisible();
  // The owner can't leave.
  await expect(page.getByRole("button", { name: /^Leave/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Channel info" }).click();
  const info = page.getByRole("dialog", { name: "Channel info" });
  await expect(info).toContainText(`#${handle}`);
  await expect(
    info.getByRole("heading", { name: "Owner" }).locator("..")
  ).toContainText("Ilhan Ozkan");
});

test.describe("layout", () => {
  test("focus mode at 390: no tab bar, Join to send messages in view", async ({
    page,
    request,
  }) => {
    await request.delete(`/api/channels/${EATS}/membership`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/channels");
    const tabs = page.getByRole("navigation", { name: "Primary" });
    await expect(tabs).toBeVisible();

    await page
      .getByRole("region", { name: "Your channels" })
      .getByRole("link", { name: "SuperApp builders" })
      .click();
    await expect(page).toHaveURL(new RegExp(`${channelPath(BUILDERS)}$`));
    await expect(tabs).toHaveCount(0);
    await expect(
      page.getByRole("textbox", { name: `Message #${BUILDERS}` })
    ).toBeInViewport();

    await page.goto(channelPath(EATS));
    await expect(tabs).toHaveCount(0);
    await expect(page.getByText("Join to send messages")).toBeInViewport();

    await page.getByRole("link", { name: "Back to Channels" }).click();
    await expect(page).toHaveURL(/\/channels$/);
    await expect(tabs).toBeVisible();
  });

  test("Delete message stays on screen, beside short and long messages", async ({
    page,
  }) => {
    expect(await roleIn(page.request, BUILDERS)).toBe("moderator");
    for (const width of [360, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(channelPath(BUILDERS));
      for (const [whose, text] of [
        ["yours", "Noted for the roadmap"],
        ["someone else's", "Welcome, builders"],
      ]) {
        const label = `${whose} at ${width}px`;
        const remove = messageRow(page, BUILDERS, text).getByRole("button", {
          name: "Delete message",
        });
        await expectFullyInView(remove, label);
        const box = (await remove.boundingBox())!;
        expect(Math.min(box.width, box.height), label).toBeGreaterThanOrEqual(
          32
        );
      }
    }
    // It asks first.
    await messageRow(page, BUILDERS, "Welcome, builders")
      .getByRole("button", { name: "Delete message" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Delete message?" });
    await expect(dialog.getByRole("button", { name: "Delete" })).toBeFocused();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      messageRow(page, BUILDERS, "Welcome, builders").getByRole("button", {
        name: "Delete message",
      })
    ).toBeFocused();
  });

  test("member counts stay in view on phones", async ({ page }) => {
    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(channelPath(BUILDERS));
      // A moderator's header also has Leave and Channel info.
      await expectTextShown(
        page.getByText(/^SuperApp builders · \d+ members?$/),
        /\d+ members?/,
        `header at ${width}px`
      );

      await page.goto("/channels?tab=discover");
      // The card's line shares its width with the Moderator badge.
      await expectTextShown(
        page
          .getByRole("region", { name: "Discover" })
          .getByRole("article", { name: "SuperApp builders" })
          .getByText(/^#superapp_builders · \d+ members?$/),
        /\d+ members?/,
        `card at ${width}px`
      );
    }
  });

  test("channel info fits a 30-character handle at 360", async ({
    page,
    request,
  }) => {
    const mine = await (await request.get("/api/channels?member=true")).json();
    const owned = mine.items.filter(
      (channel: { viewer: { role: string } }) => channel.viewer.role === "owner"
    );
    test.skip(
      owned.length >= 3,
      "The demo user owns 3 channels on this server"
    );

    // The longest handle there is, with no place to break it.
    const handle = `wide_${Date.now().toString(36)}_`.padEnd(30, "x");
    const created = await request.post("/api/channels", {
      data: { handle, name: "Wide handle" },
    });
    expect(created.status()).toBe(201);

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(channelPath(handle));
    await page.getByRole("button", { name: "Channel info" }).click();
    const info = page.getByRole("dialog", { name: "Channel info" });
    await expect(info.getByText(`#${handle}`)).toBeVisible();
    const overflow = await info.evaluate(
      (dialog) => dialog.scrollWidth - dialog.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("two panes at 1280: your channels beside the open one", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(channelPath(BUILDERS));
    const pane = page.getByRole("navigation", { name: "Your channels" });
    await expect(pane).toBeVisible();
    await expect(
      pane.getByRole("link", { name: /SuperApp builders/ })
    ).toHaveAttribute("aria-current", "page");
    await expect(log(page, BUILDERS)).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Search and trends" })
    ).toBeHidden();
  });
});

test.describe("accessibility (axe)", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`/channels and channels in ${theme} mode`, async ({ page }) => {
      // Seven full axe scans (each injects axe twice) plus five navigations
      // that wait for network idle: well inside 30 s on a fast machine, but
      // not on a loaded CI runner.
      test.slow();
      await setTheme(page, theme);
      await page.goto("/channels");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.waitForLoadState("networkidle");
      await expectNoSeriousViolations(page);

      await page.goto("/channels?tab=discover");
      await page.waitForLoadState("networkidle");
      await expectNoSeriousViolations(page);

      await page
        .getByRole("button", { name: "Create channel" })
        .first()
        .click();
      await expect(
        page.getByRole("dialog", { name: "Create channel" }).getByLabel("Name")
      ).toBeFocused();
      await expectNoSeriousViolations(page);

      for (const handle of [BUILDERS, EATS]) {
        await page.goto(channelPath(handle));
        await page.waitForLoadState("networkidle");
        await expectNoSeriousViolations(page);
      }

      // The moderator's Delete prompt and the members drawer.
      await page.goto(channelPath(BUILDERS));
      await log(page, BUILDERS)
        .getByRole("button", { name: "Delete message" })
        .first()
        .click();
      await expect(
        page
          .getByRole("dialog", { name: "Delete message?" })
          .getByRole("button", { name: "Delete" })
      ).toBeFocused();
      await expectNoSeriousViolations(page);
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: "Channel info" }).click();
      await expect(
        page
          .getByRole("dialog", { name: "Channel info" })
          .getByRole("heading", { name: "Members" })
      ).toBeVisible();
      await expectNoSeriousViolations(page);
    });
  }
});

test.describe("responsive layout", () => {
  for (const width of WIDTHS) {
    test(`no horizontal scrolling at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of [
        "/channels",
        "/channels?tab=discover",
        channelPath(BUILDERS),
        channelPath(EATS),
      ]) {
        await page.goto(path);
        await expectNoHorizontalScroll(page, `${path} at ${width}px`);
      }
    });
  }
});
