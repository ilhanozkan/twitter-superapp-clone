import { afterEach, describe, expect, it, vi } from "vitest";

import ordersReducer, {
  cancelOrder,
  latestEntry,
  ordersReceived,
  ordersState,
  placeOrder,
  simulateOrder,
} from "../../slices/ordersSlice";
import { FOLLOWS_NAVIGATION, makeStore } from "../../store";
import { stubFetch } from "../shop/testing";
import { at, iso, order, wallet } from "./testing";

// slices/ordersSlice.ts: the latest copy of each order, and the thunks that
// place, cancel and simulate orders (money is never optimistic).

afterEach(() => {
  vi.unstubAllGlobals();
});

const placed = order();
const accepted = order({}, { now: at(16) });

describe("orders reducer", () => {
  it("keeps the newest copy of each order", () => {
    let state = ordersState([placed], iso(1));
    state = ordersReducer(
      state,
      ordersReceived({ orders: [accepted], serverNow: iso(16) })
    );
    expect(state.entities["order-abc"].order.status).toBe("accepted");

    // A poll that answers late doesn't take it back.
    state = ordersReducer(
      state,
      ordersReceived({ orders: [placed], serverNow: iso(2) })
    );
    expect(state.entities["order-abc"]).toEqual({
      order: accepted,
      serverNow: iso(16),
    });
  });

  it("lets page data give way to a newer copy in the store", () => {
    const store = { orders: ordersState([accepted], iso(16)) };
    expect(latestEntry(store, { order: placed, serverNow: iso(1) }).order).toBe(
      accepted
    );
    const fresher = { order: accepted, serverNow: iso(20) };
    expect(latestEntry(store, fresher)).toBe(fresher);
  });

  it("follows navigations", () => {
    expect(FOLLOWS_NAVIGATION.has(ordersReceived.type)).toBe(true);
  });
});

describe("orders thunks", () => {
  function setup() {
    const api = stubFetch({
      "/api/orders": () => [
        201,
        { order: placed, wallet: wallet(30_210), serverNow: iso(1) },
      ],
      "/api/orders/order-abc/cancel": () => [
        200,
        {
          order: { ...placed, status: "cancelled" },
          wallet: wallet(30_860),
          serverNow: iso(5),
        },
      ],
      "/api/businesses/superapp/demo-orders": () => [
        201,
        { order: { ...placed, id: "order-demo" }, serverNow: iso(3) },
      ],
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
    return { store: makeStore(), calls: api.calls };
  }

  it("places an order with the key, then takes the server's wallet and live activity", async () => {
    const { store, calls } = setup();
    const entry = await store.dispatch(
      placeOrder(
        {
          business: "kizilaykahve",
          items: [{ productId: "seed-p-kk-latte", quantity: 1 }],
          deliveryPlaceId: "tunali",
          note: null,
          expectedTotal: 650,
          sourceTweetId: "seed-t22",
        },
        "key-12345678"
      )
    );
    expect(entry).toEqual({ order: placed, serverNow: iso(1) });
    const post = calls.find((call) => call.path === "/api/orders")!;
    expect(new Headers(post.init?.headers).get("Idempotency-Key")).toBe(
      "key-12345678"
    );
    expect(store.getState().wallet.wallet?.available).toBe(30_210);
    expect(store.getState().orders.entities["order-abc"].order).toEqual(placed);
    await vi.waitFor(() =>
      expect(calls.some((call) => call.path.startsWith("/api/activity"))).toBe(
        true
      )
    );
  });

  it("cancels with no key and settles on the refund", async () => {
    const { store, calls } = setup();
    const { order: cancelled } = await store.dispatch(
      cancelOrder("order-abc", "buyer")
    );
    expect(cancelled.status).toBe("cancelled");
    const post = calls.find((call) => call.path.endsWith("/cancel"))!;
    expect(JSON.parse(String(post.init?.body))).toEqual({ as: "buyer" });
    expect(new Headers(post.init?.headers).has("Idempotency-Key")).toBe(false);
    expect(store.getState().wallet.wallet?.available).toBe(30_860);
  });

  it("simulates a demo order without touching the viewer's wallet", async () => {
    const { store } = setup();
    const { order: demo } = await store.dispatch(
      simulateOrder("superapp", "key-87654321")
    );
    expect(demo.id).toBe("order-demo");
    expect(store.getState().orders.entities["order-demo"]).toBeDefined();
    expect(store.getState().wallet.wallet).toBeNull();
  });

  it("throws the API error and changes nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "price_changed",
                message: "Prices changed. Review your order.",
              },
            }),
            { status: 409 }
          )
      )
    );
    const store = makeStore();
    await expect(
      store.dispatch(
        placeOrder(
          {
            business: "kizilaykahve",
            items: [{ productId: "seed-p-kk-latte", quantity: 1 }],
            deliveryPlaceId: "tunali",
            expectedTotal: 600,
          },
          "key-12345678"
        )
      )
    ).rejects.toMatchObject({ code: "price_changed", status: 409 });
    expect(store.getState().orders.entities).toEqual({});
    expect(store.getState().wallet.wallet).toBeNull();
  });
});
