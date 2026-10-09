// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import cartReducer, {
  CART_MAX_LINES,
  CART_MAX_QUANTITY,
  CART_STORAGE_KEY,
  cartCleared,
  cartRestored,
  CartState,
  itemAdded,
  itemRemoved,
  readStoredCart,
  selectCartCount,
  selectCartSubtotal,
  selectQuantity,
} from "../../slices/cartSlice";
import { makeStore } from "../../store";

// The cart slice (slices/cartSlice.ts): one business per cart, limits, and
// persistence to localStorage "cart:v1".

const kahve = { username: "kizilaykahve", fullname: "Kızılay Kahve" };
const lab = { username: "lahmacunlab", fullname: "Lahmacun Lab" };
const latte = { id: "seed-p-kk-latte", name: "Pistachio latte", price: 500 };
const simit = { id: "seed-p-kk-simit", name: "Simit", price: 250 };
const lahmacun = { id: "seed-p-ll-lahmacun", name: "Lahmacun", price: 400 };

const empty: CartState = { business: null, lines: [], restored: true };

const reduce = (...actions: Parameters<typeof cartReducer>[1][]) =>
  actions.reduce(cartReducer, empty);

beforeEach(() => {
  window.localStorage.clear();
});

describe("cart reducer", () => {
  it("adds units to one business's cart", () => {
    const state = reduce(
      itemAdded({ business: kahve, product: latte }),
      itemAdded({ business: kahve, product: simit }),
      itemAdded({ business: kahve, product: latte })
    );
    expect(state.business).toEqual(kahve);
    expect(state.lines).toEqual([
      { productId: latte.id, name: latte.name, unitPrice: 500, quantity: 2 },
      { productId: simit.id, name: simit.name, unitPrice: 250, quantity: 1 },
    ]);
    const root = { cart: state };
    expect(selectCartCount(root)).toBe(3);
    expect(selectCartSubtotal(root)).toBe(1_250);
    expect(selectQuantity(root, latte.id)).toBe(2);
    expect(selectQuantity(root, "nope")).toBe(0);
  });

  it("starts a new cart for another business (any case of its username)", () => {
    let state = reduce(
      itemAdded({ business: kahve, product: latte }),
      itemAdded({
        business: { ...kahve, username: "KizilayKahve" },
        product: simit,
      })
    );
    expect(state.lines).toHaveLength(2);

    state = cartReducer(state, itemAdded({ business: lab, product: lahmacun }));
    expect(state.business).toEqual(lab);
    expect(state.lines.map((line) => line.productId)).toEqual([lahmacun.id]);
  });

  it("caps units per product and products per cart", () => {
    let state = empty;
    for (let i = 0; i < CART_MAX_QUANTITY + 5; i++) {
      state = cartReducer(
        state,
        itemAdded({ business: kahve, product: latte })
      );
    }
    expect(state.lines[0].quantity).toBe(CART_MAX_QUANTITY);

    for (let i = 0; i < CART_MAX_LINES + 2; i++) {
      state = cartReducer(
        state,
        itemAdded({
          business: kahve,
          product: { id: `p${i}`, name: `Item ${i}`, price: 100 },
        })
      );
    }
    expect(state.lines).toHaveLength(CART_MAX_LINES);
  });

  it("removes units, then the line, and an empty cart belongs to no one", () => {
    let state = reduce(
      itemAdded({ business: kahve, product: latte }),
      itemAdded({ business: kahve, product: latte })
    );
    state = cartReducer(state, itemRemoved(latte.id));
    expect(state.lines[0].quantity).toBe(1);
    state = cartReducer(state, itemRemoved(latte.id));
    expect(state).toEqual(empty);
    expect(cartReducer(state, itemRemoved("nope"))).toEqual(empty);
  });

  it("clears and restores", () => {
    const state = reduce(itemAdded({ business: kahve, product: latte }));
    expect(cartReducer(state, cartCleared())).toEqual(empty);

    const restored = cartReducer(
      { business: null, lines: [], restored: false },
      cartRestored({ business: lab, lines: state.lines })
    );
    expect(restored).toEqual({
      business: lab,
      lines: state.lines,
      restored: true,
    });
    expect(
      cartReducer({ ...restored, restored: false }, cartRestored(null))
    ).toEqual(empty);
  });
});

describe("cart persistence", () => {
  it("saves every change and removes the key when the cart empties", () => {
    const store = makeStore();
    store.dispatch(itemAdded({ business: kahve, product: latte }));
    expect(JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY)!)).toEqual({
      business: kahve,
      lines: [
        { productId: latte.id, name: latte.name, unitPrice: 500, quantity: 1 },
      ],
    });
    expect(readStoredCart()).toEqual({
      business: kahve,
      lines: store.getState().cart.lines,
    });

    store.dispatch(itemRemoved(latte.id));
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBeNull();
  });

  it("doesn't write when restoring", () => {
    const store = makeStore();
    store.dispatch(
      cartRestored({
        business: kahve,
        lines: [
          {
            productId: latte.id,
            name: latte.name,
            unitPrice: 500,
            quantity: 1,
          },
        ],
      })
    );
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBeNull();
  });

  it("reads only well-formed carts", () => {
    const store = (value: unknown) =>
      window.localStorage.setItem(
        CART_STORAGE_KEY,
        typeof value === "string" ? value : JSON.stringify(value)
      );

    store("not json");
    expect(readStoredCart()).toBeNull();
    store({ business: null, lines: [] });
    expect(readStoredCart()).toBeNull();
    store({ business: kahve, lines: "nope" });
    expect(readStoredCart()).toBeNull();

    store({
      business: { ...kahve, extra: true },
      lines: [
        { productId: "a", name: "A", unitPrice: 100, quantity: 99 },
        { productId: "b", name: "B", unitPrice: -1, quantity: 1 },
        { productId: "c", name: "", unitPrice: 100, quantity: 1 },
        { productId: "d", name: "D", unitPrice: 100, quantity: 0 },
        null,
      ],
    });
    expect(readStoredCart()).toEqual({
      business: kahve,
      lines: [
        {
          productId: "a",
          name: "A",
          unitPrice: 100,
          quantity: CART_MAX_QUANTITY,
        },
      ],
    });

    store({ business: kahve, lines: [{ productId: "b", unitPrice: 1 }] });
    expect(readStoredCart()).toBeNull();
  });

  it("works without storage", () => {
    const original = window.localStorage;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    try {
      expect(readStoredCart()).toBeNull();
      const store = makeStore();
      store.dispatch(itemAdded({ business: kahve, product: latte }));
      expect(store.getState().cart.lines).toHaveLength(1);
    } finally {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: original,
      });
    }
  });
});
