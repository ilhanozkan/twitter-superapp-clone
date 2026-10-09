import { expect, test } from "@playwright/test";

import { unique, watchConsole } from "./helpers";

test.describe("pages", () => {
  const routes: [string, string | RegExp][] = [
    ["/", "Home"],
    ["/explore", "Explore"],
    ["/explore?q=%23SuperApp", "Search results for #SuperApp"],
    ["/notifications", "Notifications"],
    ["/messages", "Messages"],
    ["/i/bookmarks", "Bookmarks"],
    ["/illlhanozkan", "Ilhan Ozkan"],
    ["/illlhanozkan/likes", "Ilhan Ozkan"],
    ["/illlhanozkan/lists", "Lists"],
    ["/sarahcodes", "Sarah Chen"],
    ["/illlhanozkan/status/seed-t05", "Tweet"],
    ["/no-such-user/status/nope", "Page not found"],
  ];

  for (const [path, heading] of routes) {
    test(`${path} renders without errors`, async ({ page }) => {
      const notFound = heading === "Page not found";
      const problems = watchConsole(page);

      const response = await page.goto(path);
      expect(response?.status()).toBe(notFound ? 404 : 200);
      await expect(
        page.getByRole("heading", { level: 1, name: heading })
      ).toBeVisible();
      await page.waitForLoadState("networkidle");

      // Chrome logs the document's own 404 status as a console error.
      const expected = notFound
        ? [expect.stringContaining("status of 404")]
        : [];
      expect(problems).toEqual(expected);
    });
  }

  test("the home timeline is server-rendered", async ({ request }) => {
    const newest = (await (await request.get("/api/tweets?limit=1")).json())
      .items[0];
    const html = await (await request.get("/")).text();
    expect(html).toContain("<article");
    expect(html).toContain(`/status/${newest.id}"`);
  });

  test("unknown profiles are 404s and usernames are case-insensitive", async ({
    page,
  }) => {
    expect((await page.goto("/ghost_user"))?.status()).toBe(404);
    await page.goto("/SarahCodes");
    await expect(page).toHaveURL(/\/sarahcodes$/);
  });
});

test.describe("tweeting", () => {
  test("a posted tweet appears on top and is still there after a reload", async ({
    page,
  }) => {
    const text = unique("Hello from Playwright #e2e");
    await page.goto("/");

    await page.getByLabel("Tweet text").fill(text);
    await page
      .getByRole("main")
      .getByRole("button", { name: "Tweet", exact: true })
      .click();

    const first = page.locator("main article").first();
    await expect(first).toContainText(text);
    await expect(page.getByLabel("Tweet text")).toHaveValue("");

    // The API route and getServerSideProps must see the same store.
    await page.reload();
    await expect(page.locator("main article").first()).toContainText(text);
  });

  test("the sidebar Tweet button opens the compose dialog", async ({
    page,
  }) => {
    const text = unique("From the dialog");
    await page.goto("/notifications");

    await page
      .getByRole("banner")
      .getByRole("button", { name: "Tweet", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Compose Tweet" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Tweet text")).toBeFocused();

    await dialog.getByLabel("Tweet text").fill(text);
    await dialog.getByRole("button", { name: "Tweet" }).click();
    await expect(dialog).toBeHidden();

    await page.goto("/");
    await expect(page.locator("main article").first()).toContainText(text);
  });

  test("tweets longer than 280 characters cannot be posted", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByLabel("Tweet text").fill("x".repeat(281));
    await expect(page.getByText("-1", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("main").getByRole("button", { name: "Tweet", exact: true })
    ).toBeDisabled();
  });

  test("you can delete your own tweet", async ({ page }) => {
    const text = unique("Delete me");
    await page.goto("/");
    await page.getByLabel("Tweet text").fill(text);
    await page
      .getByRole("main")
      .getByRole("button", { name: "Tweet", exact: true })
      .click();

    const tweet = page.locator("main article").filter({ hasText: text });
    await tweet.getByRole("button", { name: "More options" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page
      .getByRole("dialog", { name: "Delete Tweet?" })
      .getByRole("button", { name: "Delete" })
      .click();

    await expect(tweet).toHaveCount(0);
    await page.reload();
    await expect(
      page.locator("main article").filter({ hasText: text })
    ).toHaveCount(0);
  });
});

test.describe("reactions", () => {
  test("liking updates the count and persists", async ({ page }) => {
    await page.goto("/lenaframes/status/seed-t20");
    const like = page.getByRole("button", { name: /^Like\./ });
    await expect(like).toHaveAttribute("aria-pressed", "false");

    await like.click();
    await expect(like).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("1 Like", { exact: true })).toBeVisible();

    await page.reload();
    await expect(like).toHaveAttribute("aria-pressed", "true");

    await like.click();
    await expect(like).toHaveAttribute("aria-pressed", "false");
  });

  test("bookmarked tweets show up on the Bookmarks page", async ({
    page,
    request,
  }) => {
    await page.goto("/devmarco/status/seed-t18");
    const bookmark = page.getByRole("button", { name: "Bookmark" });
    await expect(bookmark).toHaveAttribute("aria-pressed", "false");
    await bookmark.click();
    await expect(bookmark).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("link", { name: "Bookmarks" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Bookmarks" })
    ).toBeVisible();
    await expect(
      page.locator("main article").filter({ hasText: "zero downtime" })
    ).toBeVisible();

    // Leave the demo store as it was, so the suite can run again on a
    // reused server.
    expect(
      (await request.delete("/api/tweets/seed-t18/bookmark")).status()
    ).toBe(200);
  });
});

test("replying from a tweet's page", async ({ page }) => {
  const text = unique("Great point");
  await page.goto("/illlhanozkan/status/seed-t19");

  await page.getByLabel("Reply text").fill(text);
  await page.getByRole("button", { name: "Reply", exact: true }).click();

  const replies = page.getByRole("region", { name: "Replies" });
  await expect(replies.locator("article").last()).toContainText(text);
  await page.reload();
  await expect(replies.locator("article").last()).toContainText(text);
});

test("searching from the sidebar opens results", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("searchbox", { name: "Search Twitter" })
    .fill("dolomites");
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/explore\?q=dolomites/);
  await expect(page.locator("main article")).toHaveCount(1);
  await expect(page.locator("main article")).toContainText(
    "Sunrise over the Dolomites"
  );
});

test("navigation uses real links and marks the current page", async ({
  page,
}) => {
  await page.goto("/explore");
  const nav = page.getByRole("navigation", { name: "Primary" });

  await expect(nav.getByRole("link", { name: "Explore" })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(nav.getByRole("link", { name: "Home" })).not.toHaveAttribute(
    "aria-current",
    "page"
  );

  await nav.getByRole("link", { name: "Profile" }).click();
  await expect(page).toHaveURL(/\/illlhanozkan$/);
  await expect(nav.getByRole("link", { name: "Profile" })).toHaveAttribute(
    "aria-current",
    "page"
  );
});

test.describe("review fixes", () => {
  // Back to Home through a page without a timeline (a tweet) and through one
  // with its own timeline (the author's profile).
  for (const via of ["tweet", "profile"] as const) {
    test(`Back from a ${via} returns to the same place in the timeline`, async ({
      page,
      request,
    }) => {
      // Enough tweets for a second page on the home timeline.
      const { items } = await (
        await request.get("/api/tweets?limit=50")
      ).json();
      for (let i = items.length; i < 45; i++) {
        const res = await request.post("/api/tweets", {
          data: { text: unique(`Filler ${i}`) },
        });
        expect(res.status()).toBe(201);
      }

      await page.goto("/");
      const articles = page.locator("main article");
      await expect(articles).toHaveCount(20);
      await articles.last().scrollIntoViewIfNeeded();
      await expect.poll(() => articles.count()).toBeGreaterThan(20);

      const target = articles.nth(30);
      await target.scrollIntoViewIfNeeded();
      const text = (await target.locator('p[dir="auto"]').innerText()).trim();
      if (via === "tweet") {
        await target.locator('p[dir="auto"]').click();
        await expect(
          page.getByRole("heading", { level: 1, name: "Tweet" })
        ).toBeVisible();
      } else {
        await target.locator('a[id$="-author"]').click();
        await expect(
          page.getByRole("navigation", { name: "Profile timelines" })
        ).toBeVisible();
      }

      await page.goBack();
      await expect(
        page.getByRole("heading", { level: 1, name: "Home" })
      ).toBeVisible();
      // The pages loaded before are still there, and so is the reader.
      await expect.poll(() => articles.count()).toBeGreaterThan(30);
      await expect(articles.filter({ hasText: text })).toBeInViewport();
    });
  }

  test("a text selection dragged out of a dialog does not close it", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Tweet", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Compose Tweet" });
    const box = dialog.getByLabel("Tweet text");
    await box.fill("A draft worth keeping");

    const area = (await box.boundingBox())!;
    await page.mouse.move(area.x + area.width - 5, area.y + 10);
    await page.mouse.down();
    await page.mouse.move(5, 5, { steps: 5 });
    await page.mouse.up();
    await expect(dialog).toBeVisible();
    await expect(box).toHaveValue("A draft worth keeping");

    // A real click on the backdrop still closes it.
    await page.mouse.click(5, 5);
    await expect(dialog).toBeHidden();
  });

  test("an image path on this site can be attached", async ({ page }) => {
    const text = unique("With a local image");
    await page.goto("/");
    await page.getByLabel("Tweet text").fill(text);
    await page.getByRole("button", { name: "Add image" }).click();
    await page.getByLabel("Image URL").fill("/media/mountains.svg");
    await page
      .getByRole("main")
      .getByRole("button", { name: "Tweet", exact: true })
      .click();

    const tweet = page.locator("main article").first();
    await expect(tweet).toContainText(text);
    await expect(
      tweet.locator('img[src="/media/mountains.svg"]')
    ).toBeVisible();
  });

  test("Ctrl or middle click on a tweet opens it in a new tab", async ({
    page,
    context,
  }) => {
    await page.goto("/lenaframes");
    const text = page
      .locator("main article")
      .filter({ hasText: "Sunrise over the Dolomites" })
      .locator('p[dir="auto"]');

    const [ctrlTab] = await Promise.all([
      context.waitForEvent("page"),
      text.click({ modifiers: ["ControlOrMeta"], position: { x: 4, y: 8 } }),
    ]);
    await expect(ctrlTab).toHaveURL(/\/lenaframes\/status\/seed-t03$/);
    await ctrlTab.close();

    const [middleTab] = await Promise.all([
      context.waitForEvent("page"),
      text.click({ button: "middle", position: { x: 4, y: 8 } }),
    ]);
    await expect(middleTab).toHaveURL(/\/lenaframes\/status\/seed-t03$/);
    await expect(page).toHaveURL("/lenaframes");
  });

  test("the profile's tweet count follows posts and deletes", async ({
    page,
  }) => {
    await page.goto("/illlhanozkan");
    const subtitle = page.locator("header, main").getByText(/^\d+ Tweets?$/);
    const count = Number((await subtitle.first().innerText()).split(" ")[0]);

    const text = unique("Counted");
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Tweet", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Compose Tweet" });
    await dialog.getByLabel("Tweet text").fill(text);
    await dialog.getByRole("button", { name: "Tweet" }).click();
    await expect(subtitle.first()).toHaveText(`${count + 1} Tweets`);

    const tweet = page.locator("main article").filter({ hasText: text });
    await tweet.getByRole("button", { name: "More options" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page
      .getByRole("dialog", { name: "Delete Tweet?" })
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(subtitle.first()).toHaveText(
      `${count} Tweet${count === 1 ? "" : "s"}`
    );
  });

  test("the Lists page redirects to the canonical username", async ({
    page,
  }) => {
    await page.goto("/ILLLHANOZKAN/lists");
    await expect(page).toHaveURL(/\/illlhanozkan\/lists$/);
    expect((await page.goto("/not valid/lists"))?.status()).toBe(404);
  });
});
