import { expect, Page } from "@playwright/test";

// Shared by the rides specs (not a spec itself: Playwright only runs
// *.spec.ts).

/**
 * The focused element's name, and whether something else covers it: its
 * centre and the middles of its top and bottom edges are hit-tested, so
 * a sticky bar over any part of its height counts.
 */
export function focusedElement(page: Page) {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement;
    const box = element.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const covered = [box.top + 2, box.top + box.height / 2, box.bottom - 2]
      .map((y) => document.elementFromPoint(x, y))
      .some(
        (hit) =>
          !hit ||
          !(
            element.contains(hit) ||
            // A ride option's card is its radio's label.
            element.closest("label")?.contains(hit)
          )
      );
    const labels = (element as HTMLSelectElement).labels;
    return {
      name:
        element.getAttribute("aria-label") ??
        labels?.[0]?.textContent ??
        element.textContent?.trim() ??
        element.tagName,
      submit: element.getAttribute("type") === "submit",
      covered,
    };
  });
}

/**
 * Tabs through the booking form on /rides from Pickup to the Book button,
 * asserting that nothing (the sticky Book bar, the tab bar) covers a
 * control as it takes focus. Returns the names of the controls reached.
 */
export async function tabThroughBooking(page: Page): Promise<string[]> {
  await page.getByLabel("Pickup", { exact: true }).focus();
  const reached: string[] = [];
  for (let presses = 0; presses < 20; presses++) {
    const focused = await focusedElement(page);
    if (focused.submit) return reached;
    reached.push(focused.name);
    expect(focused.covered, `${focused.name} is covered`).toBe(false);
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab never reached Book: ${reached.join(", ")}`);
}

/** A ride option's radio, read as one sentence. */
export const RIDE_OPTION = /^(Economy|Comfort|XL) · /;
