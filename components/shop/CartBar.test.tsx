// @vitest-environment jsdom
import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CART_STORAGE_KEY,
  itemAdded,
  itemRemoved,
} from "../../slices/cartSlice";
import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import CartBar from "./CartBar";

const kahve = { username: "kizilaykahve", fullname: "Kızılay Kahve" };
const stored = {
  business: kahve,
  lines: [
    {
      productId: "seed-p-kk-latte",
      name: "Pistachio latte",
      unitPrice: 500,
      quantity: 2,
    },
    {
      productId: "seed-p-kk-simit",
      name: "Simit",
      unitPrice: 450,
      quantity: 1,
    },
  ],
};

function renderBar(ordersOn = true) {
  return renderWithStore(<CartBar />, {
    state: {
      session: sessionState({
        viewer: testViewer,
        readOnly: false,
        features: featuresWith(
          "shop",
          ...(ordersOn ? ["orders" as const] : [])
        ),
      }),
    },
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("CartBar", () => {
  it("restores the saved cart and links to checkout with its total", async () => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(stored));
    renderBar();
    await act(async () => {});

    const link = screen.getByRole("link", {
      name: "View cart · 3 items · 14.50 credits",
    });
    expect(link.getAttribute("href")).toBe("/checkout");
    expect(link.textContent).toBe("View cart3 items · 14.50 credits");
  });

  it("announces the total politely as it changes", async () => {
    const { store } = renderBar();
    await act(async () => {});
    const status = document.querySelector('[aria-live="polite"]')!;
    expect(status.textContent).toBe("");
    expect(screen.queryByRole("link")).toBeNull();

    act(() => {
      store.dispatch(
        itemAdded({
          business: kahve,
          product: { id: "seed-p-kk-simit", name: "Simit", price: 250 },
        })
      );
    });
    expect(status.textContent).toBe("Your cart: 1 item · 2.50 credits");
    expect(screen.getByRole("link", { name: /View cart/ })).toBeTruthy();
  });

  it("keeps focused controls from scrolling under it while shown", async () => {
    const { store, unmount } = renderBar();
    await act(async () => {});
    const padding = () => document.documentElement.style.scrollPaddingBottom;
    expect(padding()).toBe("");

    act(() => {
      store.dispatch(
        itemAdded({
          business: kahve,
          product: { id: "seed-p-kk-simit", name: "Simit", price: 250 },
        })
      );
    });
    // jsdom has no layout: the bar measures 0px, leaving the gap.
    expect(padding()).toBe("16px");

    act(() => {
      store.dispatch(itemRemoved("seed-p-kk-simit"));
    });
    expect(padding()).toBe("");

    act(() => {
      store.dispatch(
        itemAdded({
          business: kahve,
          product: { id: "seed-p-kk-simit", name: "Simit", price: 250 },
        })
      );
    });
    unmount();
    expect(padding()).toBe("");
  });

  it("follows changes made in another tab", async () => {
    renderBar();
    await act(async () => {});
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(stored));
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: CART_STORAGE_KEY })
      );
    });
    expect(screen.getByRole("link", { name: /3 items/ })).toBeTruthy();
  });

  it("needs the orders feature", async () => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(stored));
    const { container } = renderBar(false);
    await act(async () => {});
    expect(container.innerHTML).toBe("");
  });
});
