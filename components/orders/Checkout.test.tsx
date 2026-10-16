// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CartLine, CartState } from "../../slices/cartSlice";
import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { IProduct } from "../../types/Shop";
import { business, product, stubFetch } from "../shop/testing";
import Checkout from "./Checkout";
import { iso, order, wallet } from "./testing";

// Checkout (§4.8): the cart priced from the menu as the server will price
// it, the payment row, and the alerts for what the server refuses.

const latte = product();
const simit = product({
  id: "seed-p-kk-simit",
  section: "Bakery",
  name: "Simit",
  price: 300, // 2.50 when it went into the cart
});
const kahve = { username: "kizilaykahve", fullname: "Kızılay Kahve" };
const line = (item: IProduct, quantity: number, unitPrice = item.price) =>
  ({ productId: item.id, name: item.name, unitPrice, quantity }) as CartLine;

type Answer = [number, unknown];
const failure = (status: number, code: string, message: string): Answer => [
  status,
  { error: { code, message } },
];

function setup({
  lines = [line(latte, 2), line(simit, 1, 250)],
  menus = [[latte, simit]],
  answer = [201, { order: order(), wallet: wallet(29_410), serverNow: iso(1) }],
  available = 30_860,
  readOnly = false,
  gone = false,
}: {
  lines?: CartLine[];
  /** The menu on each read, the last one repeating. */
  menus?: IProduct[][];
  answer?: Answer;
  available?: number;
  readOnly?: boolean;
  /** The business is gone (its menu answers 404). */
  gone?: boolean;
} = {}) {
  let reads = 0;
  const api = stubFetch({
    "/api/businesses/kizilaykahve": () =>
      gone
        ? failure(404, "not_found", "Business not found")
        : [
            200,
            {
              business: business(),
              menu: [
                {
                  title: "Menu",
                  products: menus[Math.min(reads++, menus.length - 1)],
                },
              ],
            },
          ],
    "/api/orders": () => answer,
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
  const cart: CartState = {
    business: lines.length ? kahve : null,
    lines,
    restored: true,
  };
  const result = renderWithStore(<Checkout />, {
    path: "/checkout",
    state: {
      session: sessionState({
        viewer: testViewer,
        readOnly,
        features: featuresWith("wallet", "shop", "orders"),
      }),
      wallet: { wallet: wallet(available), limits: null, loaded: true },
      cart,
    },
  });
  const menuReads = () =>
    api.calls.filter((call) => call.path === "/api/businesses/kizilaykahve")
      .length;
  return { ...result, calls: api.calls, menuReads };
}

const placeButton = () => screen.findByRole("button", { name: /^Place order/ });
const reasonOf = (button: HTMLElement) =>
  document.getElementById(button.getAttribute("aria-describedby") ?? "")
    ?.textContent;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Checkout", () => {
  it("prices the cart from the menu, with the wallet it is paid from", async () => {
    setup();
    const place = await placeButton();
    // The cart remembered Simit at 2.50; the menu says 3.00 now.
    expect(place.textContent).toBe(
      "Place order · 14.50 credits to Kızılay Kahve"
    );
    const payment = screen.getByRole("region", { name: "Payment" });
    expect(payment.textContent).toContain("Subtotal13.00 credits");
    expect(payment.textContent).toContain("Delivery fee1.50 credits");
    expect(payment.textContent).toContain("Total14.50 credits");
    expect(payment.textContent).toContain(
      "308.60 credits available · After this order 294.10 credits"
    );
    expect(screen.getByText("Open 24 hours")).toBeTruthy();
    const lines = within(screen.getByRole("region", { name: "Your order" }));
    expect(
      lines.getByRole("group", { name: "Pistachio latte in your cart" })
    ).toBeTruthy();
    // Simit at the menu's price, each and in total.
    expect(lines.getAllByText("3.00 credits")).toHaveLength(2);
  });

  it("announces the new total when a stepper changes it", async () => {
    setup();
    await placeButton();
    const status = screen
      .getByRole("region", { name: "Payment" })
      .querySelector('[aria-live="polite"]')!;
    expect(status.textContent).toBe("");
    await userEvent.click(
      screen.getByRole("button", { name: "Add one Pistachio latte" })
    );
    expect(status.textContent).toBe("Total 19.50 credits");
    expect((await placeButton()).textContent).toContain("19.50 credits");
  });

  it("places the order, empties the cart and opens the order", async () => {
    const { calls, store, router } = setup();
    await placeButton();
    await userEvent.selectOptions(screen.getByLabelText("Deliver to"), "odtu");
    await userEvent.type(screen.getByLabelText(/Note/), "Ring twice");
    await userEvent.click(await placeButton());

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/orders/order-abc")
    );
    const post = calls.find(
      (call) => call.path === "/api/orders" && call.init?.method === "POST"
    )!;
    expect(JSON.parse(String(post.init?.body))).toEqual({
      business: "kizilaykahve",
      items: [
        { productId: latte.id, quantity: 2 },
        { productId: simit.id, quantity: 1 },
      ],
      deliveryPlaceId: "odtu",
      note: "Ring twice",
      expectedTotal: 1_450,
      sourceTweetId: null,
    });
    expect(new Headers(post.init?.headers).get("Idempotency-Key")).toBeTruthy();
    expect(store.getState().cart.lines).toEqual([]);
    expect(store.getState().wallet.wallet?.available).toBe(29_410);
    expect(screen.getByRole("status").textContent).toContain(
      "Order placed · #K7Q2"
    );
  });

  it("says prices changed and shows the new ones", async () => {
    const { menuReads } = setup({
      menus: [
        [latte, simit],
        [{ ...latte, price: 550 }, simit],
      ],
      answer: failure(
        409,
        "price_changed",
        "Prices changed. Review your order."
      ),
    });
    await userEvent.click(await placeButton());
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Prices changed. Review your order."
    );
    await waitFor(() => expect(menuReads()).toBe(2));
    expect((await placeButton()).textContent).toContain("15.50 credits");
  });

  it("marks what is sold out after the server says so, and lets it go", async () => {
    setup({
      menus: [
        [latte, simit],
        [latte, { ...simit, available: false }],
      ],
      answer: failure(422, "unavailable", "Simit is sold out"),
    });
    await userEvent.click(await placeButton());
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Simit is sold out"
    );
    const remove = await screen.findByRole("button", { name: "Remove Simit" });
    expect(screen.getByText("Sold out")).toBeTruthy();

    await userEvent.click(remove);
    const place = await placeButton();
    expect(place.getAttribute("aria-disabled")).toBeNull();
    expect(place.textContent).toContain("11.50 credits");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps focus on the lines when one goes, then on Browse Food", async () => {
    setup({ lines: [line(latte, 1), line(simit, 1)] });
    await placeButton();
    const button = (name: string) => screen.getByRole("button", { name });

    // The last line's last "Remove one": focus moves to the line before it.
    button("Remove one Simit").focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.queryByText("Simit")).toBeNull();
    expect(document.activeElement).toBe(button("Remove one Pistachio latte"));

    // The only line: the cart is empty, and Browse Food takes focus.
    await userEvent.keyboard("{Enter}");
    expect(
      screen.getByRole("heading", { name: "Your cart is empty" })
    ).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "Browse Food" })
    );
  });

  it("moves focus to the next line when a sold-out one is removed", async () => {
    setup({
      lines: [line(simit, 1), line(latte, 2)],
      menus: [[latte, { ...simit, available: false }]],
    });
    await placeButton();
    screen.getByRole("button", { name: "Remove Simit" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.queryByText("Sold out")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Remove one Pistachio latte" })
    );
  });

  it("clears the cart of a business that is gone, focusing Browse Food", async () => {
    setup({ gone: true });
    const clear = await screen.findByRole("button", { name: "Clear cart" });
    clear.focus();
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "Browse Food" })
    );
  });

  it("explains what stands in the way before anything is sent", async () => {
    setup({ available: 500 });
    let place = await placeButton();
    expect(place.getAttribute("aria-disabled")).toBe("true");
    expect(reasonOf(place)).toBe(
      "You have 5.00 credits available. Add credits"
    );
    expect(
      screen.getByRole("link", { name: "Add credits" }).getAttribute("href")
    ).toBe("/wallet");
    cleanup();

    const cheap = { ...simit, price: 250 };
    const { calls } = setup({ lines: [line(cheap, 1)], menus: [[cheap]] });
    place = await placeButton();
    expect(reasonOf(place)).toBe(
      "The minimum order at Kızılay Kahve is 3.00 credits. Add 0.50 credits more."
    );
    await userEvent.click(place);
    expect(calls.some((call) => call.path === "/api/orders")).toBe(false);
  });

  it("disables Place order on a read-only demo", async () => {
    setup({ readOnly: true });
    const place = await placeButton();
    expect(place.getAttribute("aria-disabled")).toBe("true");
    expect(reasonOf(place)).toBe(
      "Ordering is turned off on this read-only demo."
    );
  });

  it("offers Browse Food for an empty cart", async () => {
    setup({ lines: [] });
    expect(
      screen.getByRole("heading", { name: "Your cart is empty" })
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Browse Food" }).getAttribute("href")
    ).toBe("/food");
  });
});
