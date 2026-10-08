import { expect, Page, test } from "@playwright/test";

// Fails the test on any console error or uncaught exception, which also
// catches hydration mismatches and Content-Security-Policy violations.
function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(String(error)));
  return problems;
}

const unique = (label: string) => `${label} ${Date.now().toString(36)}`;

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
    const html = await (await request.get("/")).text();
    expect(html).toContain("Welcome to Twitter SuperApp");
    expect(html).toContain("<article");
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
    await expect(page.getByText("-1")).toBeVisible();
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
    const unlike = page.getByRole("button", { name: /^Unlike\./ });
    await expect(unlike).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("1 Like", { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: /^Unlike\./ })).toBeVisible();

    await page.getByRole("button", { name: /^Unlike\./ }).click();
    await expect(page.getByRole("button", { name: /^Like\./ })).toBeVisible();
  });

  test("bookmarked tweets show up on the Bookmarks page", async ({ page }) => {
    await page.goto("/devmarco/status/seed-t18");
    await page.getByRole("button", { name: "Bookmark", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Remove Bookmark" })
    ).toBeVisible();

    await page.getByRole("link", { name: "Bookmarks" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Bookmarks" })
    ).toBeVisible();
    await expect(
      page.locator("main article").filter({ hasText: "zero downtime" })
    ).toBeVisible();
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
