// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { IBusiness } from "../../types/Business";
import { IProduct } from "../../types/Shop";
import { business, card, product, status, stubFetch } from "../shop/testing";
import { DELIVER_TO_KEY } from "./deliverTo";
import OrderDialogs from "./OrderDialogs";
import { iso, order, wallet } from "./testing";

// Order now (§4.8): the quick order sheet, opened from a product card.

const latte = product();
const placed = order();

type Answer = [number, unknown];
const failure = (
  status: number,
  code: string,
  message: string,
  details?: { path: string; message: string }[]
): Answer => [status, { error: { code, message, details } }];

function setup({
  answers = [
    [201, { order: placed, wallet: wallet(30_210), serverNow: iso(1) }],
  ],
  item = latte,
  shop = business(),
  readOnly = false,
  productStatus = 200,
}: {
  answers?: Answer[];
  item?: IProduct;
  shop?: IBusiness;
  readOnly?: boolean;
  productStatus?: number;
} = {}) {
  let posted = 0;
  const api = stubFetch({
    [`/api/products/${latte.id}`]: () =>
      productStatus === 200
        ? [200, { product: item, card: card() }]
        : failure(404, "not_found", "Product not found"),
    "/api/businesses/kizilaykahve": () => [
      200,
      { business: shop, menu: [{ title: "Coffee", products: [item] }] },
    ],
    "/api/orders": () => answers[Math.min(posted++, answers.length - 1)],
    "/api/activity": () => [
      200,
      {
        serverNow: iso(1),
        unreadConversations: 0,
        newNotifications: 0,
        live: [],
      },
    ],
  });
  vi.stubGlobal("fetch", vi.fn(api.fetch));
  const result = renderWithStore(<OrderDialogs />, {
    state: {
      session: sessionState({
        viewer: testViewer,
        readOnly,
        features: featuresWith("wallet", "shop", "orders"),
      }),
      wallet: { wallet: wallet(30_860), limits: null, loaded: true },
      ui: {
        composeOpen: false,
        composePrefill: null,
        dialog: "quickOrder",
        dialogArgs: { productId: latte.id, tweetId: "seed-t22" },
        toasts: [],
      },
    },
  });
  const posts = () =>
    api.calls.filter(
      (call) => call.path === "/api/orders" && call.init?.method === "POST"
    );
  return { ...result, calls: api.calls, posts };
}

const sheet = () => screen.getByRole("dialog", { name: "Order now" });
const payButton = () =>
  within(sheet()).findByRole("button", { name: /^Pay [\d.]+ credits$/ });

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("QuickOrderSheet", () => {
  it("prices the order, reviews it and places it, crediting the Tweet", async () => {
    const { store, posts } = setup();
    await payButton();
    const text = sheet().textContent;
    expect(text).toContain("Subtotal5.00 credits");
    expect(text).toContain("Delivery fee1.50 credits");
    expect(text).toContain("Total6.50 credits");
    expect(text).toContain("From your available 308.60 credits");

    // One at least: Remove one stays focusable but does nothing.
    const removeOne = within(sheet()).getByRole("button", {
      name: "Remove one Pistachio latte",
    });
    expect(removeOne.getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(removeOne);
    await userEvent.click(
      within(sheet()).getByRole("button", { name: "Add one Pistachio latte" })
    );
    expect(removeOne.getAttribute("aria-disabled")).toBeNull();
    await userEvent.selectOptions(
      within(sheet()).getByLabelText("Deliver to"),
      "tunali"
    );
    await userEvent.type(within(sheet()).getByLabelText(/Note/), "Oat milk");
    await userEvent.click(
      within(sheet()).getByRole("button", { name: "Pay 11.50 credits" })
    );

    // The review (WCAG 3.3.4) focuses a confirm that repeats amount and payee.
    const confirm = within(sheet()).getByRole("button", {
      name: "Pay 11.50 credits to Kızılay Kahve",
    });
    expect(document.activeElement).toBe(confirm);
    expect(sheet().textContent).toContain(
      "Pistachio latte ×2 · Deliver to Tunalı Hilmi"
    );
    await userEvent.click(confirm);

    const done = await within(sheet()).findByRole("heading", {
      name: "Order placed · #K7Q2",
    });
    expect(document.activeElement).toBe(done);
    expect(
      within(sheet())
        .getByRole("link", { name: "Track order" })
        .getAttribute("href")
    ).toBe("/orders/order-abc");

    const [post] = posts();
    expect(JSON.parse(String(post.init?.body))).toEqual({
      business: "kizilaykahve",
      items: [{ productId: latte.id, quantity: 2 }],
      deliveryPlaceId: "tunali",
      note: "Oat milk",
      expectedTotal: 1_150,
      sourceTweetId: "seed-t22",
    });
    expect(store.getState().wallet.wallet?.available).toBe(30_210);
    expect(store.getState().ui.toasts.map((toast) => toast.message)).toEqual([
      "Order placed · #K7Q2",
    ]);
    expect(window.localStorage.getItem(DELIVER_TO_KEY)).toBe("tunali");
  });

  it("keeps one Idempotency-Key per order, across retries and Back", async () => {
    const { posts } = setup({
      answers: [
        failure(402, "insufficient_funds", "Not enough credits"),
        failure(402, "insufficient_funds", "Not enough credits"),
      ],
    });
    await userEvent.click(await payButton());
    const confirm = within(sheet()).getByRole("button", {
      name: "Pay 6.50 credits to Kızılay Kahve",
    });
    await userEvent.click(confirm);
    expect(await within(sheet()).findByRole("alert")).toBeTruthy();
    await userEvent.click(confirm);
    await waitFor(() => expect(posts()).toHaveLength(2));

    await userEvent.click(
      within(sheet()).getByRole("button", { name: "Back" })
    );
    await userEvent.click(await payButton());
    await userEvent.click(
      within(sheet()).getByRole("button", {
        name: "Pay 6.50 credits to Kızılay Kahve",
      })
    );
    await waitFor(() => expect(posts()).toHaveLength(3));

    await userEvent.click(
      within(sheet()).getByRole("button", { name: "Back" })
    );
    await userEvent.click(
      within(sheet()).getByRole("button", { name: "Add one Pistachio latte" })
    );
    await userEvent.click(await payButton());
    await userEvent.click(
      within(sheet()).getByRole("button", {
        name: "Pay 11.50 credits to Kızılay Kahve",
      })
    );
    await waitFor(() => expect(posts()).toHaveLength(4));

    const keys = posts().map((call) =>
      new Headers(call.init?.headers).get("Idempotency-Key")
    );
    // The same order three times, then a different one.
    expect(new Set(keys.slice(0, 3)).size).toBe(1);
    expect(keys[3]).not.toBe(keys[0]);
  });

  it("re-reads the item when the price changed, and says so", async () => {
    const { calls } = setup({
      answers: [
        failure(409, "price_changed", "Prices changed. Review your order."),
      ],
    });
    await userEvent.click(await payButton());
    await userEvent.click(
      within(sheet()).getByRole("button", {
        name: "Pay 6.50 credits to Kızılay Kahve",
      })
    );
    expect((await within(sheet()).findByRole("alert")).textContent).toContain(
      "Prices changed. Review your order."
    );
    await waitFor(() =>
      expect(
        calls.filter((call) => call.path === "/api/businesses/kizilaykahve")
      ).toHaveLength(2)
    );
  });

  it("marks the item sold out when the server says so, without reading it again", async () => {
    const { calls } = setup({
      answers: [
        failure(422, "unavailable", "Pistachio latte is sold out", [
          { path: "productId", message: latte.id },
        ]),
      ],
    });
    await userEvent.click(await payButton());
    await userEvent.click(
      within(sheet()).getByRole("button", {
        name: "Pay 6.50 credits to Kızılay Kahve",
      })
    );
    expect((await within(sheet()).findByRole("alert")).textContent).toContain(
      "Pistachio latte is sold out"
    );

    // Back on the form: the badge, and Pay says why it won't.
    await userEvent.click(
      within(sheet()).getByRole("button", { name: "Back" })
    );
    const pay = await payButton();
    expect(within(sheet()).getByText("Sold out")).toBeTruthy();
    expect(pay.getAttribute("aria-disabled")).toBe("true");
    expect(
      document.getElementById(pay.getAttribute("aria-describedby")!)
        ?.textContent
    ).toBe("Pistachio latte is sold out.");
    expect(
      calls.filter((call) => call.path === "/api/businesses/kizilaykahve")
    ).toHaveLength(1);
  });

  it("re-reads the item when the refusal is about the business", async () => {
    const { calls } = setup({
      answers: [
        failure(
          422,
          "unavailable",
          "Kızılay Kahve isn't taking orders right now"
        ),
      ],
    });
    await userEvent.click(await payButton());
    await userEvent.click(
      within(sheet()).getByRole("button", {
        name: "Pay 6.50 credits to Kızılay Kahve",
      })
    );
    expect((await within(sheet()).findByRole("alert")).textContent).toContain(
      "isn't taking orders right now"
    );
    await waitFor(() =>
      expect(
        calls.filter((call) => call.path === "/api/businesses/kizilaykahve")
      ).toHaveLength(2)
    );
  });

  it("won't pay what the server would refuse, and says why", async () => {
    setup({ shop: business({ status: status.closed }) });
    const pay = await payButton();
    expect(pay.getAttribute("aria-disabled")).toBe("true");
    expect(pay.getAttribute("aria-describedby")).toBeTruthy();
    expect(
      document.getElementById(pay.getAttribute("aria-describedby")!)
        ?.textContent
    ).toBe("Kızılay Kahve: Closed · Opens 18:00");
    await userEvent.click(pay);
    expect(
      within(sheet()).queryByRole("button", { name: /to Kızılay Kahve$/ })
    ).toBeNull();
    cleanup();

    setup({ item: product({ available: false }) });
    expect(
      document.getElementById(
        (await payButton()).getAttribute("aria-describedby")!
      )?.textContent
    ).toBe("Pistachio latte is sold out.");
    cleanup();

    setup({ readOnly: true });
    expect(
      document.getElementById(
        (await payButton()).getAttribute("aria-describedby")!
      )?.textContent
    ).toBe("Ordering is turned off on this read-only demo.");
  });

  it("says so when the item is gone", async () => {
    setup({ productStatus: 404 });
    expect(
      await within(sheet()).findByText("This item is no longer available.")
    ).toBeTruthy();
  });
});
