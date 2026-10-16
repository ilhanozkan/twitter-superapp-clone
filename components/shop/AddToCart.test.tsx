// @vitest-environment jsdom
import { act, cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CART_MAX_LINES,
  CART_STORAGE_KEY,
  CartState,
} from "../../slices/cartSlice";
import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { IProduct } from "../../types/Shop";
import AddToCart from "./AddToCart";
import { product } from "./testing";

const kahve = { username: "kizilaykahve", fullname: "Kızılay Kahve" };
const latte = product();

function renderAdd({
  item = latte,
  cart,
  ordersOn = true,
  readOnly = false,
  disabled = false,
}: {
  item?: IProduct;
  cart?: Partial<CartState>;
  ordersOn?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
} = {}) {
  return renderWithStore(
    <>
      <p id="reason">Ordering is turned off on this read-only demo.</p>
      <AddToCart
        product={item}
        business={kahve}
        disabled={disabled}
        reasonId="reason"
      />
    </>,
    {
      state: {
        session: sessionState({
          viewer: testViewer,
          readOnly,
          features: featuresWith(
            "shop",
            ...(ordersOn ? ["orders" as const] : [])
          ),
        }),
        cart: { business: null, lines: [], restored: true, ...cart },
      },
    }
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("AddToCart", () => {
  it("renders nothing until the orders feature is on", () => {
    renderAdd({ ordersOn: false });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("turns into a stepper named for the item, moving focus along", async () => {
    const { store } = renderAdd();
    await userEvent.click(
      screen.getByRole("button", { name: "Add Pistachio latte" })
    );

    const addOne = screen.getByRole("button", {
      name: "Add one Pistachio latte",
    });
    expect(document.activeElement).toBe(addOne);
    expect(
      within(
        screen.getByRole("group", { name: "Pistachio latte in your cart" })
      ).getByText("1")
    ).toBeTruthy();

    await userEvent.click(addOne);
    expect(store.getState().cart.lines).toEqual([
      {
        productId: "seed-p-kk-latte",
        name: "Pistachio latte",
        unitPrice: 500,
        quantity: 2,
      },
    ]);

    await userEvent.click(
      screen.getByRole("button", { name: "Remove one Pistachio latte" })
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Remove one Pistachio latte" })
    );
    expect(store.getState().cart.lines).toEqual([]);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Add Pistachio latte" })
    );
  });

  it("saves the cart on this device", async () => {
    renderAdd();
    await userEvent.click(
      screen.getByRole("button", { name: "Add Pistachio latte" })
    );
    expect(JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY)!)).toEqual({
      business: kahve,
      lines: [
        {
          productId: "seed-p-kk-latte",
          name: "Pistachio latte",
          unitPrice: 500,
          quantity: 1,
        },
      ],
    });
  });

  it("disables a sold-out product, saying so", () => {
    renderAdd({ item: product({ available: false }) });
    const button = screen.getByRole("button", { name: "Sold out" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("is disabled with the page's reason when nothing can be ordered", () => {
    renderAdd({ disabled: true, readOnly: true });
    const add = screen.getByRole("button", { name: "Add Pistachio latte" });
    expect((add as HTMLButtonElement).disabled).toBe(true);
    expect(add.getAttribute("aria-describedby")).toBe("reason");
  });

  it("asks before replacing a cart from another business", async () => {
    const lahmacun = {
      business: { username: "lahmacunlab", fullname: "Lahmacun Lab" },
      lines: [
        {
          productId: "seed-p-ll-lahmacun",
          name: "Lahmacun",
          unitPrice: 400,
          quantity: 2,
        },
      ],
    };
    const { store } = renderAdd({ cart: lahmacun });

    await userEvent.click(
      screen.getByRole("button", { name: "Add Pistachio latte" })
    );
    let prompt = screen.getByRole("dialog", { name: "Start a new cart?" });
    expect(prompt.textContent).toContain(
      "Your cart from Lahmacun Lab will be cleared."
    );
    await userEvent.click(
      within(prompt).getByRole("button", { name: "Cancel" })
    );
    expect(store.getState().cart).toMatchObject(lahmacun);

    await userEvent.click(
      screen.getByRole("button", { name: "Add Pistachio latte" })
    );
    prompt = screen.getByRole("dialog", { name: "Start a new cart?" });
    await userEvent.click(
      within(prompt).getByRole("button", { name: "Start new cart" })
    );
    expect(store.getState().cart).toMatchObject({
      business: kahve,
      lines: [{ productId: "seed-p-kk-latte", quantity: 1 }],
    });
  });

  it("refuses an eleventh different item with a message", async () => {
    const lines = Array.from({ length: CART_MAX_LINES }, (_, index) => ({
      productId: `p${index}`,
      name: `Item ${index}`,
      unitPrice: 100,
      quantity: 1,
    }));
    const { store } = renderAdd({ cart: { business: kahve, lines } });
    await userEvent.click(
      screen.getByRole("button", { name: "Add Pistachio latte" })
    );
    expect(store.getState().cart.lines).toHaveLength(CART_MAX_LINES);
    expect(store.getState().ui.toasts.map((toast) => toast.message)).toEqual([
      "Your cart is full: it holds up to 10 different items.",
    ]);
  });

  it("restores the cart saved on this device before adding", async () => {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({
        business: kahve,
        lines: [
          {
            productId: "seed-p-kk-latte",
            name: "Pistachio latte",
            unitPrice: 500,
            quantity: 3,
          },
        ],
      })
    );
    const { store } = renderAdd({ cart: { restored: false } });
    await act(async () => {});
    expect(store.getState().cart.restored).toBe(true);
    expect(
      screen.getByRole("group", { name: "Pistachio latte in your cart" })
        .textContent
    ).toContain("3");
  });
});
