import { expect, Page, test } from "@playwright/test";

import type { ILiveActivity } from "../types/Superapp";
import {
  expectNoHorizontalScroll,
  expectNoSeriousViolations,
  idempotencyKey,
  setTheme,
  topUp,
  watchConsole,
  WIDTHS,
} from "./helpers";

// The SuperApp shell as the demo user sees it: Services, the wallet pages,
// navigation at every breakpoint and tips on Tweets.

const PAGES: [string, string][] = [
  ["/services", "Services"],
  ["/wallet", "Wallet"],
  ["/wallet/transactions/seed-tx03", "Receipt"],
];

test.describe("pages", () => {
  for (const [path, heading] of PAGES) {
    test(`${path} renders without errors`, async ({ page }) => {
      const problems = watchConsole(page);
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(
        page.getByRole("heading", { level: 1, name: heading })
      ).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(problems).toEqual([]);
    });
  }

  test("the wallet shows the balance as demo credits and links to receipts", async ({
    page,
  }) => {
    await page.goto("/wallet");
    const balance = page.getByRole("region", { name: "Balance" });
    await expect(balance).toContainText("credits");
    await expect(balance.getByText("Demo", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Demo credits have no cash value", { exact: false })
    ).toBeVisible();

    const activity = page.getByRole("region", { name: "Activity" });
    await activity
      .getByRole("link", { name: /Payment from Marco Rossi/ })
      .click();
    await expect(page).toHaveURL(/\/wallet\/transactions\/seed-tx03$/);
    await expect(page.getByText("Thanks for the code review 🙏")).toBeVisible();
  });

  test("Services links to the wallet", async ({ page }) => {
    await page.goto("/services");
    await page
      .getByRole("region", { name: "Services" })
      .getByRole("link", { name: /Wallet/ })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Wallet" })
    ).toBeVisible();
  });
});

test.describe("navigation", () => {
  for (const width of [1280, 1100, 800]) {
    test(`Wallet and Services are in the sidebar at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const nav = page.getByRole("navigation", { name: "Primary" });
      await expect(nav.getByRole("link", { name: "Wallet" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Services" })).toBeVisible();

      await nav.getByRole("link", { name: "Services" }).click();
      await expect(nav.getByRole("link", { name: "Services" })).toHaveAttribute(
        "aria-current",
        "page"
      );
    });
  }

  test("phones get Home, Explore, Services, Notifications and Messages tabs", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const tabs = page.getByRole("navigation", { name: "Primary" });
    // Each tab's name is its sr-only text ("Notifications, 3 new").
    const names = await tabs
      .getByRole("link")
      .locator(".sr-only")
      .allTextContents();
    expect(names.map((name) => name.split(",")[0])).toEqual([
      "Home",
      "Explore",
      "Services",
      "Notifications",
      "Messages",
    ]);

    await page.getByRole("button", { name: /account menu/ }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: "Wallet" })).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "Bookmarks" })
    ).toBeVisible();
    await menu.getByRole("menuitem", { name: "Wallet" }).click();
    await expect(page).toHaveURL(/\/wallet$/);
  });

  test("phones reach the account menu from Explore too", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/explore");

    await page.getByRole("button", { name: /account menu/ }).click();
    await page.getByRole("menuitem", { name: "Profile" }).click();
    await expect(page).toHaveURL(/\/illlhanozkan$/);
  });

  test("the bell counts new notifications until Notifications is opened", async ({
    page,
  }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(
      nav.getByRole("link", { name: /^Notifications, \d+ new$/ })
    ).toBeVisible();

    await nav.getByRole("link", { name: /^Notifications/ }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Notifications" })
    ).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Notifications", exact: true })
    ).toBeVisible();

    // Per device: it stays cleared after a reload.
    await page.goto("/");
    await expect(
      nav.getByRole("link", { name: "Notifications", exact: true })
    ).toBeVisible();
  });
});

test.describe("live activity", () => {
  // Nothing is in progress in F's demo (orders and rides add live items),
  // so the activity response gets one added.
  const ride: ILiveActivity = {
    kind: "ride",
    id: "e2e-ride",
    title: "Ride to Atakule",
    status: "On the way",
    eta: null,
    href: "/rides/e2e-ride",
    nextChangeAt: null,
  };

  /** What hides the focused element: the sticky header the banner is in. */
  const coveredFocus = (page: Page) =>
    page.evaluate(() => {
      const active = document.activeElement;
      const header = document
        .querySelector('section[aria-label="Live activity"]')
        ?.closest(".sticky");
      if (!(active instanceof HTMLElement) || !header) return null;
      if (active === document.body || header.contains(active)) return null;
      // The tab bar, compose button and skip link don't scroll.
      for (let el: Element | null = active; el; el = el.parentElement) {
        if (getComputedStyle(el).position === "fixed") return null;
      }
      const box = active.getBoundingClientRect();
      const bar = header.getBoundingClientRect();
      const beside = box.right <= bar.left || box.left >= bar.right;
      if (beside || box.top >= bar.bottom) return null;
      const name = active.getAttribute("aria-label") ?? active.textContent;
      return `"${name?.trim().slice(0, 40)}" at ${Math.round(box.top)}px, under a header ending at ${Math.round(bar.bottom)}px`;
    });

  for (const width of [390, 768]) {
    test(`keyboard focus stays clear of the header and its banner at ${width}px`, async ({
      page,
    }) => {
      await page.route(/\/api\/activity(\?|$)/, async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        await route.fulfill({ response, json: { ...body, live: [ride] } });
      });
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/");
      await expect(
        page.getByRole("region", { name: "Live activity" })
      ).toContainText("Ride to Atakule");

      for (let i = 0; i < 80; i++) await page.keyboard.press("Tab");
      // Going back up is where the browser scrolls each element to the top.
      const covered: string[] = [];
      for (let i = 0; i < 75; i++) {
        await page.keyboard.press("Shift+Tab");
        const problem = await coveredFocus(page);
        if (problem) covered.push(problem);
      }
      expect(covered).toEqual([]);
    });
  }
});

test("a tip sent through the API shows on the Tweet's page", async ({
  page,
  request,
}) => {
  const tweetId = "seed-t20";
  const before = (await (await request.get(`/api/tweets/${tweetId}`)).json())
    .tweet.stats.tips;
  await topUp(request, 100);

  const response = await request.post(`/api/tweets/${tweetId}/tip`, {
    headers: { "Idempotency-Key": idempotencyKey() },
    data: { amount: 100 },
  });
  expect(response.status()).toBe(201);
  const { tweet, transfer } = await response.json();
  expect(tweet.stats.tips).toBe(before + 1);
  expect(tweet.viewer.tipped).toBe(true);

  await page.goto(`/lenaframes/status/${tweetId}`);
  const tips = before + 1;
  await expect(
    page.getByText(`${tips} ${tips === 1 ? "Tip" : "Tips"}`, { exact: true })
  ).toBeVisible();

  // The tip is in the wallet's activity with its receipt.
  await page.goto(`/wallet/transactions/${transfer.id}`);
  await expect(page.getByText("Tip on @lenaframes's Tweet")).toBeVisible();
  await page.getByRole("link", { name: "Tweet", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/lenaframes/status/${tweetId}$`));
});

test.describe("accessibility (axe)", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const [path] of PAGES) {
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
      for (const [path] of PAGES) {
        await page.goto(path);
        await expectNoHorizontalScroll(page, `${path} at ${width}px`);
      }
    });
  }
});
