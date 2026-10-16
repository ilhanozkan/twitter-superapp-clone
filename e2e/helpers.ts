import AxeBuilder from "@axe-core/playwright";
import { APIRequestContext, expect, Page } from "@playwright/test";

import type { IFeatures } from "../types/Superapp";

/**
 * Collects console errors and uncaught exceptions, which also catches
 * hydration mismatches and Content-Security-Policy violations.
 */
export function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(String(error)));
  return problems;
}

/** Text no other run has used, for Tweets the test looks for. */
export const unique = (label: string) => `${label} ${Date.now().toString(36)}`;

/** A fresh Idempotency-Key. */
export const idempotencyKey = () =>
  `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Starts the page in a theme (before its scripts run). */
export async function setTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript(
    (value) => window.localStorage.setItem("theme", value),
    theme
  );
}

/** No serious or critical WCAG 2.2 AA violations on the page as it is. */
export async function expectNoSeriousViolations(page: Page) {
  await settleTransitions(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = results.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? "")
  );
  expect(
    serious.map(
      (violation) =>
        `${violation.id}: ${violation.nodes
          .map((node) => node.target.join(" "))
          .join(", ")}`
    )
  ).toEqual([]);
}

/**
 * Waits for running CSS transitions to end. axe reads colours as painted, so
 * a control whose state just changed (a chip turning blue with white text)
 * would be checked halfway between its two colour schemes. Looping
 * animations, like spinners, are left alone.
 */
async function settleTransitions(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => animation.finished.catch(() => undefined))
    )
  );
}

/** The widths every page must fit without scrolling sideways. */
export const WIDTHS = [360, 390, 768, 1024, 1280, 1440];

/** How far the page scrolls sideways, in CSS pixels (0 or less when it fits). */
export function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (document.scrollingElement ?? document.documentElement).scrollWidth -
      window.innerWidth
  );
}

export async function expectNoHorizontalScroll(page: Page, label: string) {
  expect(await horizontalOverflow(page), label).toBeLessThanOrEqual(0);
}

/** Which SuperApp features this server has on (a test skips while its feature is off). */
export async function features(request: APIRequestContext): Promise<IFeatures> {
  const response = await request.get("/api/me");
  expect(response.status()).toBe(200);
  return (await response.json()).features;
}

/**
 * Makes sure the acting user can spend `cents`, topping up when needed, so
 * a test never depends on the seeded balance (specs assert deltas, never
 * absolute balances). Top-ups are limited (3 per day), so it adds credits
 * only when the available balance is short.
 */
export async function topUp(request: APIRequestContext, cents: number) {
  const wallet = await request.get("/api/wallet");
  expect(wallet.status()).toBe(200);
  if ((await wallet.json()).wallet.available >= cents) return;

  const response = await request.post("/api/wallet/top-ups", {
    headers: { "Idempotency-Key": idempotencyKey() },
    data: { amount: 10_000 },
  });
  expect(response.status()).toBe(201);
}

/**
 * Presses Tab up to `presses` times and returns the controls something
 * else covered (a sticky bottom bar, the tab bar) as they took focus: the
 * middle and the top and bottom edges of each are hit-tested. Stops after
 * the control whose name matches `until`.
 */
export async function coveredWhileTabbing(
  page: Page,
  { presses, until }: { presses: number; until?: RegExp }
): Promise<string[]> {
  const covered: string[] = [];
  for (let press = 0; press < presses; press++) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body) return null;
      const box = element.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const hidden = [box.top + 2, box.top + box.height / 2, box.bottom - 2]
        .map((y) => document.elementFromPoint(x, y))
        .some(
          (hit) =>
            !hit ||
            !(element.contains(hit) || element.closest("label")?.contains(hit))
        );
      const name =
        element.getAttribute("aria-label") ??
        (element as HTMLInputElement).labels?.[0]?.textContent ??
        element.textContent ??
        element.tagName;
      return { name: name.trim().slice(0, 60), hidden };
    });
    if (!focused) continue;
    if (focused.hidden) covered.push(focused.name);
    if (until?.test(focused.name)) break;
  }
  return covered;
}
