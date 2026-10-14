import { expect, Page, test } from "@playwright/test";

import {
  expectNoHorizontalScroll,
  expectNoSeriousViolations,
  features,
  setTheme,
  unique,
  watchConsole,
} from "./helpers";

// Stories as the demo user sees them (§4.10). The seed is this lane's:
// Mert Demir (foodie_ankara) has two stories the demo user hasn't seen, and
// only the first test watches them. Every other test opens other accounts
// or its own stories.

const tray = (page: Page) => page.getByRole("region", { name: "Stories" });
const viewer = (page: Page) => page.getByRole("dialog", { name: "Stories" });
const position = (page: Page) => viewer(page).locator("[aria-live='polite']");

test("the tray lists your story first, then unseen accounts, then seen ones", async ({
  page,
}) => {
  const problems = watchConsole(page);
  await page.goto("/");
  const buttons = tray(page).getByRole("button");
  await expect(buttons.nth(0)).toHaveAccessibleName("Your story");
  await expect(buttons.nth(1)).toHaveAccessibleName("Add to your story");
  await expect(buttons.nth(2)).toHaveAccessibleName(
    "Twitter SuperApp's stories, 1 new"
  );
  await expect(
    tray(page).getByRole("button", { name: "Mert Demir's stories, 2 new" })
  ).toBeVisible();
  await expect(buttons.last()).toHaveAccessibleName("Lena Hoffmann's stories");
  await page.waitForLoadState("networkidle");
  expect(problems).toEqual([]);
});

test("watching Mert's stories with the arrow keys turns his ring grey", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const mert = tray(page).getByRole("button", {
    name: "Mert Demir's stories, 2 new",
  });
  await expect(mert.locator("[data-ring]")).toHaveAttribute(
    "data-ring",
    "unseen"
  );
  await mert.click();

  await expect(viewer(page)).toBeVisible();
  await expect(position(page)).toHaveText(
    /^Story 1 of 2 by Mert Demir, posted \d+ hours? ago$/
  );
  await expect(
    viewer(page).getByRole("img", { name: "A cup of Turkish coffee" })
  ).toBeVisible();
  await expect(viewer(page).getByText("Afternoon fuel")).toBeVisible();
  await expect(
    viewer(page).getByRole("button", { name: "Pause" })
  ).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect(position(page)).toHaveText(/^Story 2 of 2 by Mert Demir/);
  await expect(
    viewer(page).getByText("Lahmacun crawl tonight. Who's in? 🌯")
  ).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(position(page)).toHaveText(/^Story 1 of 2 by Mert Demir/);
  await page.keyboard.press("ArrowRight");

  await page.keyboard.press("Escape");
  await expect(viewer(page)).toBeHidden();
  const seen = tray(page).getByRole("button", {
    name: "Mert Demir's stories",
    exact: true,
  });
  await expect(seen).toBeFocused();
  await expect(seen.locator("[data-ring]")).toHaveAttribute(
    "data-ring",
    "seen"
  );

  // Closing reported both stories: the server agrees after a reload.
  await expect
    .poll(async () => {
      const body = await (
        await request.get("/api/stories?author=foodie_ankara")
      ).json();
      return body.items.map(
        (story: { viewer: { seen: boolean } }) => story.viewer.seen
      );
    })
    .toEqual([true, true]);
  await page.reload();
  await expect(seen.locator("[data-ring]")).toHaveAttribute(
    "data-ring",
    "seen"
  );
});

test("Pause stops a story from moving on", async ({ page }) => {
  await page.goto("/stories/lenaframes");
  await expect(viewer(page)).toBeVisible();
  await viewer(page).getByRole("button", { name: "Pause" }).click();
  await expect(
    viewer(page).getByRole("button", { name: "Play" })
  ).toBeVisible();
  await page.waitForTimeout(7_000);
  await expect(viewer(page)).toBeVisible();
  await expect(position(page)).toHaveText(/^Story 1 of 1 by Lena Hoffmann/);
});

test("a posted text story shows first in the tray and can be deleted", async ({
  page,
  request,
}) => {
  const text = unique("Story from Playwright");
  await page.goto("/");

  await tray(page).getByRole("button", { name: "Add to your story" }).click();
  const composer = page.getByRole("dialog", { name: "Add to your story" });
  await expect(composer.getByLabel("Story text")).toBeFocused();
  await composer.getByLabel("Story text").fill(text);
  await composer
    .locator("label")
    .filter({ has: page.getByRole("radio", { name: "Purple" }) })
    .click();
  await expect(composer.getByRole("radio", { name: "Purple" })).toBeChecked();
  // The live preview, on the chosen background.
  await expect(
    composer.locator("[data-background='purple']", { hasText: text })
  ).toBeVisible();
  await composer.getByRole("button", { name: "Share to your story" }).click();
  await expect(composer).toBeHidden();
  await expect(
    page.getByRole("status").filter({ hasText: "Your story was shared." })
  ).toBeVisible();

  // "Your story" stays first, now with the new story to watch.
  const yours = tray(page).getByRole("listitem").first();
  await expect(
    yours.getByRole("button", { name: "Your story", exact: true })
  ).toBeVisible();
  await expect(yours.locator("[data-ring]")).toHaveAttribute(
    "data-ring",
    "unseen"
  );
  await yours.getByRole("button", { name: "Your story", exact: true }).click();
  await expect(viewer(page)).toBeVisible();
  await viewer(page).getByRole("button", { name: "Pause" }).click();
  for (let step = 0; step < 10; step += 1) {
    if (await viewer(page).getByText(text).isVisible()) break;
    await page.keyboard.press("ArrowRight");
  }
  await expect(viewer(page).getByText(text)).toBeVisible();
  await expect(
    viewer(page).getByRole("button", { name: "Seen by 0" })
  ).toBeVisible();

  await viewer(page).getByRole("button", { name: "Story options" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const confirm = viewer(page).getByRole("region", {
    name: "Delete this story?",
  });
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(viewer(page).getByText(text)).toHaveCount(0);

  const mine = await (
    await request.get("/api/stories?author=illlhanozkan")
  ).json();
  expect(
    mine.items.some(
      (story: { content: { text?: string } }) => story.content.text === text
    )
  ).toBe(false);
});

test("an image story needs alt text", async ({ page }) => {
  await page.goto("/");
  await tray(page).getByRole("button", { name: "Add to your story" }).click();
  const composer = page.getByRole("dialog", { name: "Add to your story" });
  await composer.getByRole("tab", { name: "Photo" }).click();
  await composer.getByLabel("Image URL").fill("/media/coffee.svg");
  await composer.getByRole("button", { name: "Share to your story" }).click();

  await expect(composer.getByLabel("Alt text")).toBeFocused();
  await expect(composer.getByLabel("Alt text")).toHaveAttribute(
    "aria-invalid",
    "true"
  );
  await expect(composer.getByText(/^Alt text is required/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(composer).toBeHidden();
});

test("the viewers panel lists who watched your story", async ({ page }) => {
  await page.goto("/stories/illlhanozkan?story=seed-story07");
  await expect(viewer(page)).toBeVisible();
  await viewer(page).getByRole("button", { name: "Pause" }).click();
  await viewer(page).getByRole("button", { name: "Seen by 3" }).click();

  const panel = viewer(page).getByRole("region", { name: "Viewers" });
  await expect(panel.getByText("Sarah Chen")).toBeVisible();
  await expect(panel.getByText("@devmarco")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(viewer(page)).toBeVisible();
  await expect(
    viewer(page).getByRole("button", { name: "Seen by 3" })
  ).toBeFocused();
});

test("a link to a story opens the viewer over a page that lists the stories", async ({
  page,
}) => {
  const problems = watchConsole(page);
  await page.goto("/stories/lenaframes?story=seed-story05");
  await expect(viewer(page)).toBeVisible();
  await expect(
    viewer(page).getByRole("img", { name: "Sunrise over mountain peaks" })
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { level: 1, name: "Lena Hoffmann's stories" })
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Lena Hoffmann's stories" })
  ).toContainText("Dolomites, 5:42am");
  await page.waitForLoadState("networkidle");
  expect(problems).toEqual([]);

  await page.goto("/stories/lenaframes?story=gone");
  await expect(
    page.getByRole("heading", { name: "This story is no longer available" })
  ).toBeVisible();
  await expect(viewer(page)).toBeHidden();
  expect((await page.goto("/stories/nobody_here"))?.status()).toBe(404);
});

test("a story reply lands in a direct message", async ({ page, request }) => {
  test.skip(
    !(await features(request)).messages,
    "Replies go to Messages, which is off on this server"
  );
  const text = unique("Replying to your story");
  await page.goto("/stories/sarahcodes");
  await expect(viewer(page)).toBeVisible();
  await viewer(page).getByLabel("Reply to Sarah Chen").fill(text);
  await viewer(page).getByRole("button", { name: "Send" }).click();
  await viewer(page).getByRole("link", { name: "View in Messages" }).click();
  await expect(page).toHaveURL(/\/messages\/[A-Za-z0-9_-]+$/);
  // From 1024px the chat list beside the log previews the same text.
  await expect(
    page.getByRole("log", { name: "Messages with Sarah Chen" }).getByText(text)
  ).toBeVisible();
});

test("no reply field while Messages is off", async ({ page, request }) => {
  test.skip(
    (await features(request)).messages,
    "Messages is on: replies are tested above"
  );
  await page.goto("/stories/sarahcodes");
  await expect(viewer(page)).toBeVisible();
  await expect(viewer(page).getByLabel(/^Reply to/)).toHaveCount(0);
});

test("the tray scrolls inside itself on a 360px phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  const list = tray(page).getByRole("list");
  const size = await list.evaluate((element) => ({
    scroll: element.scrollWidth,
    client: element.clientWidth,
  }));
  expect(size.scroll).toBeGreaterThan(size.client);
  await expectNoHorizontalScroll(page, "Home at 360px");

  // The last account is reachable: Tab scrolls the list, not the page.
  const last = tray(page).getByRole("button").last();
  await last.focus();
  expect(await list.evaluate((element) => element.scrollLeft)).toBeGreaterThan(
    0
  );
  await expect(last).toBeInViewport();
  await expectNoHorizontalScroll(page, "Home at 360px, scrolled");
});

test("arrow buttons scroll the tray where it overflows", async ({ page }) => {
  await page.setViewportSize({ width: 560, height: 800 });
  await page.goto("/");
  const list = tray(page).getByRole("list");
  const overflows = await list.evaluate(
    (element) => element.scrollWidth > element.clientWidth
  );
  test.skip(!overflows, "The tray fits at this width");

  await tray(page).locator("button[aria-hidden='true']").last().click();
  await expect
    .poll(() => list.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
});

test("the viewer fits a phone with Previous and Next as tap zones", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/stories/lenaframes");
  await expect(viewer(page)).toBeVisible();
  const next = viewer(page).getByRole("button", { name: "Next story" });
  const previous = viewer(page).getByRole("button", { name: "Previous story" });
  await expect(next).toBeVisible();
  await expect(previous).toBeVisible();
  const box = await next.boundingBox();
  expect(box?.width).toBeGreaterThan(150);
  await expectNoHorizontalScroll(page, "viewer at 390px");
});

test("the viewer leaves room for Previous and Next from 500px", async ({
  page,
}) => {
  // Narrow and tall: the canvas width is bounded by the width, not height.
  for (const [width, height] of [
    [500, 1000],
    [520, 1000],
    [768, 1024],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/stories/lenaframes");
    await expect(viewer(page)).toBeVisible();
    await viewer(page).getByRole("button", { name: "Pause" }).click();
    const size = `${width}x${height}`;
    const overflow = await viewer(page).evaluate(
      (element) => element.scrollWidth - element.clientWidth
    );
    expect(overflow, `viewer overflow at ${size}`).toBeLessThanOrEqual(0);
    for (const name of ["Previous story", "Next story"]) {
      const box = await viewer(page)
        .getByRole("button", { name })
        .boundingBox();
      expect(box, `${name} at ${size}`).not.toBeNull();
      expect(box!.x, `${name} at ${size}`).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, `${name} at ${size}`).toBeLessThanOrEqual(
        width
      );
    }
  }
});

for (const theme of ["light", "dark"] as const) {
  test(`Home, the viewer and the composer have no serious axe violations (${theme})`, async ({
    page,
  }) => {
    await setTheme(page, theme);
    await page.goto("/");
    await expect(tray(page)).toBeVisible();
    await expectNoSeriousViolations(page);

    // A text story (light) and a photo story (dark).
    const account =
      theme === "light" ? /^Sarah Chen's stories/ : /^Kızılay Kahve's stories/;
    await tray(page).getByRole("button", { name: account }).click();
    await expect(viewer(page)).toBeVisible();
    await viewer(page).getByRole("button", { name: "Pause" }).click();
    await expectNoSeriousViolations(page);
    await page.keyboard.press("Escape");
    await expect(viewer(page)).toBeHidden();

    await tray(page).getByRole("button", { name: "Add to your story" }).click();
    const composer = page.getByRole("dialog", { name: "Add to your story" });
    await composer.getByLabel("Story text").fill("Checking contrast");
    await expectNoSeriousViolations(page);
    await composer.getByRole("tab", { name: "Photo" }).click();
    await expectNoSeriousViolations(page);
    await page.keyboard.press("Escape");

    await page.goto("/stories/lenaframes?story=gone");
    await expectNoSeriousViolations(page);
  });
}
