import AxeBuilder from "@axe-core/playwright";
import { expect, Page, test } from "@playwright/test";

const PAGES = [
  "/",
  "/explore",
  "/explore?q=%23SuperApp",
  "/notifications",
  "/messages",
  "/i/bookmarks",
  "/sarahcodes",
  "/illlhanozkan/likes",
  "/illlhanozkan/lists",
  "/illlhanozkan/status/seed-t05",
  "/nobody/status/nope",
];

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript(
    (value) => window.localStorage.setItem("theme", value),
    theme
  );
}

test.describe("accessibility (axe)", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const path of PAGES) {
      test(`${path} has no serious violations in ${theme} mode`, async ({
        page,
      }) => {
        await setTheme(page, theme);
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await page.waitForLoadState("networkidle");

        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        const serious = results.violations.filter((v) =>
          ["serious", "critical"].includes(v.impact ?? "")
        );
        expect(
          serious.map(
            (v) =>
              `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`
          )
        ).toEqual([]);
      });
    }
  }
});

test.describe("responsive layout", () => {
  const widths = [360, 390, 768, 1024, 1280, 1440];

  for (const width of widths) {
    test(`no horizontal scrolling at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of [
        "/",
        "/sarahcodes",
        "/illlhanozkan/status/seed-t03",
        "/explore",
        // A long unbroken query in the "No results" title.
        `/explore?q=${"x".repeat(100)}`,
      ]) {
        await page.goto(path);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth
        );
        expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
      }
    });
  }

  test("phones get a bottom tab bar and a compose button", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(page.locator("header")).toBeHidden();
    const tabs = page.getByRole("navigation", { name: "Primary" });
    await expect(tabs.getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page"
    );

    await page.getByRole("button", { name: "Compose a Tweet" }).click();
    await expect(
      page.getByRole("dialog", { name: "Compose Tweet" })
    ).toBeVisible();
  });

  test("phones reach Display through the header menu", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await page.getByRole("button", { name: /account menu/ }).click();
    await page.getByRole("menuitem", { name: "Display" }).click();
    await page.getByRole("radio", { name: /Lights out/ }).check();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("the rail's menus are not clipped by the narrow sidebar", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");

    await page.getByRole("button", { name: "More", exact: true }).click();
    const menu = page.getByRole("menu", { name: "More" });
    const shadow = await menu.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).not.toBe("none");
    // click() fails if anything else would receive the click.
    await menu.getByRole("menuitem", { name: "Keyboard shortcuts" }).click();
    await expect(
      page.getByRole("dialog", { name: "Keyboard shortcuts" })
    ).toBeVisible();
  });

  test("tablets get an icon rail with accessible names", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link", { name: "Explore" })).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Search and trends" })
    ).toBeVisible();
  });
});

test.describe("display settings", () => {
  test("the theme can be changed and is remembered without a flash", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: "Display" }).click();
    await page.getByRole("radio", { name: /Lights out/ }).check();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // The stored choice is applied by the inline script before React loads.
    const themeBeforeHydration = await page.evaluate(async () => {
      const html = await (await fetch("/")).text();
      return html.includes('localStorage.getItem("theme")');
    });
    expect(themeBeforeHydration).toBe(true);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const background = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    );
    expect(background).toBe("rgb(0, 0, 0)");
  });

  test("automatic follows the system setting", async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "dark" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await context.close();
  });
});

test.describe("keyboard", () => {
  test("the skip link jumps to the main content", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();
  });

  test("shortcuts: n composes, / searches, ? lists shortcuts", async ({
    page,
  }) => {
    await page.goto("/notifications");

    await page.keyboard.press("n");
    const compose = page.getByRole("dialog", { name: "Compose Tweet" });
    await expect(compose).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(compose).toBeHidden();

    await page.keyboard.press("/");
    await expect(
      page.getByRole("searchbox", { name: "Search Twitter" })
    ).toBeFocused();
    // Shortcuts are off while typing; leave the search box first.
    await page.keyboard.press("Escape");
    await page
      .getByRole("searchbox", { name: "Search Twitter" })
      .evaluate((element) => (element as HTMLElement).blur());

    await page.keyboard.press("?");
    await expect(
      page.getByRole("dialog", { name: "Keyboard shortcuts" })
    ).toBeVisible();
  });

  test("single-key shortcuts can be turned off", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("?");
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await dialog
      .getByRole("switch", { name: /Single-key shortcuts/ })
      .uncheck();
    await page.keyboard.press("Escape");

    await page.keyboard.press("n");
    await expect(
      page.getByRole("dialog", { name: "Compose Tweet" })
    ).toBeHidden();
    await page.reload();
    await page.keyboard.press("n");
    await expect(
      page.getByRole("dialog", { name: "Compose Tweet" })
    ).toBeHidden();
  });

  test("/ focuses the Explore search when the right column is hidden", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto("/notifications");
    await page.keyboard.press("/");
    await expect(page).toHaveURL(/\/explore$/);
    await expect(
      page.getByRole("main").getByRole("searchbox", { name: "Search Twitter" })
    ).toBeFocused();
  });

  test("the compose dialog opens at full height", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("n");
    const box = page
      .getByRole("dialog", { name: "Compose Tweet" })
      .getByLabel("Tweet text");
    await expect(box).toBeVisible();
    expect(
      await box.evaluate((el) => (el as HTMLTextAreaElement).clientHeight)
    ).toBeGreaterThanOrEqual(60);
  });

  test("Ctrl+Enter sends a tweet and a toast confirms it", async ({ page }) => {
    const text = `Sent with the keyboard ${Date.now().toString(36)}`;
    await page.goto("/");
    await page.getByLabel("Tweet text").fill(text);
    await page.getByLabel("Tweet text").press("Control+Enter");

    const toast = page
      .getByRole("status")
      .filter({ hasText: "Your Tweet was sent." });
    await expect(toast).toBeVisible();
    await toast.getByRole("link", { name: "View" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Tweet" })
    ).toBeVisible();
    await expect(page.locator("main article").first()).toContainText(text);
  });
});

test("the character counter warns near the limit", async ({ page }) => {
  await page.goto("/");
  const box = page.getByLabel("Tweet text");

  await box.fill("x".repeat(265));
  await expect(page.getByText("15 characters left")).toBeAttached();

  await box.fill("x".repeat(285));
  await expect(page.getByText("-5 characters left")).toBeAttached();
  await expect(
    page.getByRole("main").getByRole("button", { name: "Tweet", exact: true })
  ).toBeDisabled();
});
