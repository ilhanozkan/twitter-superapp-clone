import { expect, test } from "@playwright/test";

import {
  expectNoHorizontalScroll,
  expectNoSeriousViolations,
  setTheme,
  WIDTHS,
} from "./helpers";

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
        await expectNoSeriousViolations(page);
      });
    }
  }
});

test.describe("responsive layout", () => {
  for (const width of WIDTHS) {
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
        await expectNoHorizontalScroll(page, `${path} at ${width}px`);
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

    const compose = page.getByRole("dialog", { name: "Compose Tweet" });
    // The shortcuts listen from an effect, which can run after the load event
    // goto waits for: a key pressed before React has hydrated is lost.
    await expect(async () => {
      await page.keyboard.press("n");
      await expect(compose).toBeVisible({ timeout: 1_000 });
    }).toPass();
    // Escape hides the dialog at once, but the browser fires its close event
    // a frame later. By then focus must have left it: a key typed in between
    // (like "/" next) went to the hidden text box.
    await page.evaluate(() => {
      const record = () => {
        document.body.dataset.focusOnClose = document.activeElement?.tagName;
      };
      window.addEventListener("close", record, { capture: true, once: true });
    });
    await page.keyboard.press("Escape");
    await expect(compose).toBeHidden();
    await expect(page.locator("body")).toHaveAttribute(
      "data-focus-on-close",
      "BODY"
    );

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
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    const toggle = dialog.getByRole("switch", { name: /Single-key shortcuts/ });
    const compose = page.getByRole("dialog", { name: "Compose Tweet" });

    await page.goto("/");
    // The shortcuts listen from an effect, which can run after the load event
    // goto waits for: a key pressed before React has hydrated is lost.
    await expect(async () => {
      await page.keyboard.press("?");
      await expect(dialog).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await toggle.uncheck();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await page.keyboard.press("n");
    await expect(compose).toBeHidden();

    await page.reload();
    // Still off. The menu renders only after React has hydrated and run its
    // effects, so the shortcuts are listening when "n" is pressed below.
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: "Keyboard shortcuts" }).click();
    await expect(toggle).not.toBeChecked();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await page.keyboard.press("n");
    await expect(compose).toBeHidden();
  });

  test("/ focuses the Explore search when the right column is hidden", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto("/notifications");
    // goto resolves on the load event, which can come before hydration adds
    // the shortcut listener: a key pressed in between is lost, so retry.
    await expect(async () => {
      await page.keyboard.press("/");
      await expect(page).toHaveURL(/\/explore$/, { timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    await expect(
      page.getByRole("main").getByRole("searchbox", { name: "Search Twitter" })
    ).toBeFocused();
  });

  test("the compose dialog opens at full height", async ({ page }) => {
    await page.goto("/");
    const box = page
      .getByRole("dialog", { name: "Compose Tweet" })
      .getByLabel("Tweet text");
    // "n" is heard by a listener the page adds once React has hydrated it,
    // which can be after the load event: press again until the dialog opens.
    await expect(async () => {
      await page.keyboard.press("n");
      await expect(box).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
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
