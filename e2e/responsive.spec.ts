import { expect, Locator, Page, test } from "@playwright/test";

import { horizontalOverflow } from "./helpers";

// Every SuperApp route fits a 360px phone and a 1280px desktop without
// scrolling sideways (§12.2), one load each. The feature specs check their
// own pages at all six widths and their dialogs; this one keeps a route
// nobody sweeps from slipping through. Visits are chosen to leave other
// specs' state alone: Marco's conversation and Kızılay Kahve's story are
// already read and seen by the specs before this one.

const CART = {
  business: { username: "kizilaykahve", fullname: "Kızılay Kahve" },
  lines: [
    {
      productId: "seed-p-kk-latte",
      name: "Pistachio latte",
      unitPrice: 500,
      quantity: 2,
    },
    {
      productId: "seed-p-kk-cheesecake",
      name: "San Sebastian cheesecake",
      unitPrice: 600,
      quantity: 1,
    },
  ],
};

const ROUTES = [
  "/",
  "/services",
  "/wallet",
  "/wallet?tab=requests",
  "/wallet/transactions/seed-tx03",
  "/messages",
  "/messages/dm-devmarco-illlhanozkan",
  // A draft, or the conversation once someone has started one.
  "/messages?to=zeynep_xl",
  "/channels",
  "/channels?tab=discover",
  "/channels/superapp_builders",
  "/food",
  "/kizilaykahve",
  "/kizilaykahve/menu",
  "/kizilaykahve/status/seed-t22",
  "/business",
  "/business?tab=menu",
  "/business?tab=settings",
  "/checkout",
  "/orders",
  "/orders/seed-o01",
  "/rides",
  "/rides?from=kizilay&to=esenboga",
  "/rides/seed-ride01",
  "/stories/kizilaykahve",
  "/notifications",
];

/** Checkout needs something in the cart; the menus then show the cart bar. */
async function withCart(page: Page) {
  await page.addInitScript((cart) => {
    window.localStorage.setItem("cart:v1", JSON.stringify(cart));
  }, CART);
}

for (const width of [360, 1280]) {
  test(`every SuperApp route fits ${width}px without scrolling sideways`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await withCart(page);
    for (const path of ROUTES) {
      await test.step(path, async () => {
        const response = await page.goto(path);
        expect.soft(response?.status(), path).toBe(200);
        // Client data (the restored cart, polls) can widen a page after load.
        await page.waitForLoadState("networkidle");
        expect
          .soft(await horizontalOverflow(page), `${path} at ${width}px`)
          .toBeLessThanOrEqual(0);
      });
    }
  });
}

/**
 * Tabs from the top of the page through `list` and says, for each item
 * focus lands on, whether the whole item is inside the list's box.
 */
async function tabThrough(page: Page, list: Locator, presses: number) {
  const items: { name: string; inView: boolean }[] = [];
  for (let press = 0; press < presses; press++) {
    await page.keyboard.press("Tab");
    const item = await list.evaluate((element) => {
      const focused = document.activeElement;
      const li = focused?.closest("li");
      if (!li || !element.contains(li)) return null;
      const box = li.getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      return {
        name: focused!.getAttribute("aria-label") ?? li.textContent ?? "",
        inView: box.left >= bounds.left - 1 && box.right <= bounds.right + 1,
      };
    });
    if (item) items.push(item);
    else if (items.length > 0) break;
  }
  return items;
}

test.describe("phones", () => {
  test("Tab scrolls the story tray and the business row to the item it lands on", async ({
    page,
  }) => {
    // Chrome leaves an item that is partly in view where it is.
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");
    const tray = page
      .getByRole("region", { name: "Stories" })
      .getByRole("list");
    await expect(tray.getByRole("listitem").nth(4)).toBeAttached();
    const stories = await tabThrough(page, tray, 30);
    expect(stories.length).toBeGreaterThanOrEqual(5);
    expect(stories.filter((item) => !item.inView)).toEqual([]);

    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/services");
    const row = page
      .getByRole("region", { name: "Order from" })
      .getByRole("list");
    await expect(row.getByRole("listitem").nth(3)).toBeAttached();
    const businesses = await tabThrough(page, row, 60);
    expect(businesses.length).toBeGreaterThanOrEqual(4);
    expect(businesses.filter((item) => !item.inView)).toEqual([]);
  });

  test("focus never stays under the floating compose button", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const compose = await page
      .getByRole("button", { name: "Compose a Tweet" })
      .boundingBox();
    const control = page
      .locator("main article")
      .nth(3)
      .getByRole("button", { name: "More options" });
    const box = (await control.boundingBox())!;
    // Scroll the control under the button, then give it focus.
    await page.evaluate(
      (by) => window.scrollBy(0, by),
      box.y + box.height / 2 - (compose!.y + compose!.height / 2)
    );
    await page.waitForFunction(
      ([button, target]) => {
        const element = document.querySelectorAll("main article")[3];
        const rect = element
          ?.querySelector('[aria-label="More options"]')
          ?.getBoundingClientRect();
        return !!rect && rect.bottom > button && rect.top < target;
      },
      [compose!.y, compose!.y + compose!.height]
    );

    await control.focus();

    const focused = (await control.boundingBox())!;
    expect(focused.y + focused.height).toBeLessThanOrEqual(compose!.y);
  });

  test("taps on the cart bar's margin reach the menu behind it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await withCart(page);
    await page.goto("/kizilaykahve/menu");
    const cart = page.getByRole("link", { name: /^View cart/ });
    await expect(cart).toBeVisible();

    const swallowed = await cart.evaluate((link) => {
      const bar = link.parentElement!;
      const box = bar.getBoundingClientRect();
      // Above the pill and left of its rounded end.
      const hit = document.elementFromPoint(box.left + 8, box.top + 3);
      return !hit || bar.contains(hit);
    });
    expect(swallowed).toBe(false);
  });
});
