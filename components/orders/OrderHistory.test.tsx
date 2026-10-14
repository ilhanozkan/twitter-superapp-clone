// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { ordersState } from "../../slices/ordersSlice";
import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import OrderHistory from "./OrderHistory";
import { iso, order } from "./testing";

// The buyer's /orders: Active, Past, and Order again.

const section = (name: string) => screen.getByRole("region", { name });
const codes = (name: string) =>
  within(section(name))
    .queryAllByRole("heading", { level: 3 })
    .map((heading) => heading.textContent);

afterEach(() => {
  cleanup();
});

describe("OrderHistory", () => {
  // Both as the page read them at T0 + 1 s: one delivered an hour ago.
  const delivered = order({ id: "seed-o01" }, { placedAfter: -3_600 });
  const active = order({ id: "order-new", code: "N3W1" });

  function history(cart = { business: null, lines: [], restored: true }) {
    return renderWithStore(
      <OrderHistory
        ids={[active.id, delivered.id]}
        nextCursor={null}
        serverNow={iso(1)}
      />,
      {
        path: "/orders",
        state: {
          session: sessionState({
            viewer: testViewer,
            readOnly: false,
            features: featuresWith("wallet", "shop", "orders"),
          }),
          orders: ordersState([active, delivered], iso(1)),
          cart,
        },
      }
    );
  }

  it("lists Active and Past, with Order again on deliveries", async () => {
    const { store, router } = history();
    expect(codes("Active")).toEqual(["Kızılay Kahve · #N3W1"]);
    expect(codes("Past")).toEqual(["Kızılay Kahve · #K7Q2"]);
    expect(
      within(section("Active"))
        .getByRole("link", { name: "Kızılay Kahve · #N3W1" })
        .getAttribute("href")
    ).toBe("/orders/order-new");
    expect(within(section("Active")).queryByRole("button")).toBeNull();

    await userEvent.click(
      within(section("Past")).getByRole("button", {
        name: "Order again from Kızılay Kahve",
      })
    );
    expect(store.getState().cart.lines).toHaveLength(1);
    expect(router.push).toHaveBeenCalledWith("/checkout");
  });

  it("asks before replacing a cart that holds something", async () => {
    const { store, router } = history({
      business: { username: "lahmacunlab", fullname: "Lahmacun Lab" },
      lines: [
        {
          productId: "seed-p-ll-lahmacun",
          name: "Lahmacun",
          unitPrice: 400,
          quantity: 2,
        },
      ],
      restored: true,
    } as never);
    await userEvent.click(
      screen.getByRole("button", { name: "Order again from Kızılay Kahve" })
    );
    const prompt = screen.getByRole("dialog", { name: "Start a new cart?" });
    expect(prompt.textContent).toContain(
      "Your cart from Lahmacun Lab will be cleared."
    );
    await userEvent.click(
      within(prompt).getByRole("button", { name: "Cancel" })
    );
    expect(store.getState().cart.business?.username).toBe("lahmacunlab");
    expect(router.push).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: "Order again from Kızılay Kahve" })
    );
    await userEvent.click(
      within(
        screen.getByRole("dialog", { name: "Start a new cart?" })
      ).getByRole("button", { name: "Start new cart" })
    );
    expect(store.getState().cart.business?.username).toBe("kizilaykahve");
    expect(router.push).toHaveBeenCalledWith("/checkout");
  });
});
