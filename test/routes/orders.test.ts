import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MemoryState } from "../../lib/db/memory";
import { startOfLocalDay } from "../../lib/superapp/orders";
import { IOrder } from "../../types/Order";
import { call, freshApi, json, MockRequest, MockResponse } from "../api";

// The orders endpoints on a fresh superapp-world memory store, acting as
// the demo user (who manages @superapp) unless a test says otherwise. They
// assert C2's own seed records and deltas, never whole-world totals.

const ROUTES = {
  orders: "pages/api/orders/index",
  order: "pages/api/orders/[id]/index",
  cancel: "pages/api/orders/[id]/cancel",
  demoOrders: "pages/api/businesses/[username]/demo-orders",
  summary: "pages/api/businesses/[username]/summary",
  wallet: "pages/api/wallet/index",
  me: "pages/api/me",
} as const;

type Handler = Parameters<typeof call>[0];
let api: Record<keyof typeof ROUTES, Handler>;

let keyCount = 0;
const newKey = () => `order-key-${String(++keyCount).padStart(6, "0")}`;

const LATTE = "seed-p-kk-latte";
const SIMIT = "seed-p-kk-simit";

/** A latte from Kızılay Kahve: 5.00 + 1.50 delivery. */
const orderBody = (fields: Record<string, unknown> = {}) => ({
  business: "kizilaykahve",
  items: [{ productId: LATTE, quantity: 1 }],
  deliveryPlaceId: "tunali",
  expectedTotal: 650,
  ...fields,
});

const keyed = (
  body: unknown,
  key = newKey(),
  headers: Record<string, string> = {}
): MockRequest => ({
  method: "POST",
  ...json(body, { "idempotency-key": key, ...headers }),
});

const placeOrder = (fields: Record<string, unknown> = {}, key?: string) =>
  call(api.orders, keyed(orderBody(fields), key));

async function placed(fields: Record<string, unknown> = {}): Promise<IOrder> {
  const res = await placeOrder(fields);
  expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
  return res.body.order;
}

const cancel = (id: string, as: unknown) =>
  call(api.cancel, { method: "POST", query: { id }, ...json({ as }) });

const simulate = (username = "superapp", key = newKey()) =>
  call(api.demoOrders, {
    method: "POST",
    query: { username },
    headers: { "idempotency-key": key },
  });

const state = () =>
  (globalThis as { __superappMemoryState?: MemoryState })
    .__superappMemoryState!;

const actAs = (username: string) => vi.stubEnv("DEMO_USERNAME", username);

async function myBalance(): Promise<number> {
  return (await call(api.wallet)).body.wallet.balance;
}

function expectError(
  res: MockResponse,
  status: number,
  code: string,
  label?: string
) {
  expect(res.statusCode, label).toBe(status);
  expect(res.body.error.code, label).toBe(code);
  expect(res.headers["cache-control"], label).toBe("no-store");
}

function expectInvalid(res: MockResponse, path: string, label?: string) {
  expectError(res, 400, "validation_error", label);
  expect(res.body.error.details[0].path, label).toBe(path);
}

const isRecent = (iso: string) =>
  Math.abs(Date.parse(iso) - Date.now()) < 5_000;

beforeEach(async () => {
  const { loadRoute } = await freshApi({ world: "superapp" });
  api = Object.fromEntries(
    await Promise.all(
      Object.entries(ROUTES).map(async ([name, path]) => [
        name,
        await loadRoute(path),
      ])
    )
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/orders", () => {
  it("places an order, pays from the wallet and points at it", async () => {
    const before = await myBalance();
    const res = await placeOrder({
      items: [
        { productId: LATTE, quantity: 1 },
        { productId: SIMIT, quantity: 2 },
      ],
      expectedTotal: 1_150,
      note: "  Oat milk, please  ",
      sourceTweetId: "seed-t22",
    });

    expect(res.statusCode).toBe(201);
    const { order, wallet, serverNow } = res.body;
    expect(res.headers.location).toBe(`/api/orders/${order.id}`);
    expect(res.headers["idempotent-replayed"]).toBeUndefined();
    expect(order).toMatchObject({
      buyer: { username: "illlhanozkan", fullname: "Ilhan Ozkan" },
      business: { username: "kizilaykahve", category: "cafe" },
      total: 1_150,
      note: "Oat milk, please",
      sourceTweetId: "seed-t22",
      status: "placed",
      canCancel: { buyer: true, business: true },
    });
    expect(wallet.balance).toBe(before - 1_150);
    expect(isRecent(serverNow)).toBe(true);
    expect(
      (await call(api.order, { query: { id: order.id } })).body.order
    ).toEqual(order);
  });

  it("replays a key with the original status and refuses it for another body", async () => {
    const first = await placeOrder({}, "replay-key-0001");
    const again = await placeOrder({}, "replay-key-0001");

    expect(again.statusCode).toBe(201);
    expect(again.headers["idempotent-replayed"]).toBe("true");
    expect(again.body.order).toEqual(first.body.order);
    expect(again.headers.location).toBe(first.headers.location);

    const reused = await placeOrder({ note: "Different" }, "replay-key-0001");
    expectError(reused, 422, "idempotency_key_reused");
  });

  it("answers 409 price_changed when the client's total is out of date", async () => {
    const before = await myBalance();
    const res = await placeOrder({ expectedTotal: 600 });
    expectError(res, 409, "price_changed");
    expect(res.body.error.message).toBe("Prices changed. Review your order.");
    expect(await myBalance()).toBe(before);
  });

  it("lists unavailable products in the 422 details", async () => {
    state().shop.products.get(SIMIT)!.available = false;
    const res = await placeOrder({
      items: [
        { productId: LATTE, quantity: 1 },
        { productId: SIMIT, quantity: 1 },
        { productId: "seed-p-sa-mug", quantity: 1 },
      ],
      expectedTotal: 900,
    });
    expectError(res, 422, "unavailable");
    expect(res.body.error.details).toEqual([
      { path: "productId", message: SIMIT },
      { path: "productId", message: "seed-p-sa-mug" },
    ]);

    state().business.profiles.get("kizilaykahve")!.acceptingOrders = false;
    const paused = await placeOrder();
    expectError(paused, 422, "unavailable");
    expect(paused.body.error.message).toBe(
      "Kızılay Kahve isn't taking orders right now"
    );
  });

  it("maps the other refusals: limit, funds, freeze, own business, unknown business", async () => {
    expectError(
      await placeOrder({
        business: "superapp",
        items: [{ productId: "seed-p-sa-mug", quantity: 17 }],
        expectedTotal: 20_700,
      }),
      422,
      "limit_exceeded"
    );
    expectError(
      await placeOrder({ business: "lahmacunlab_x" }),
      404,
      "not_found"
    );
    expectError(await placeOrder({ business: "sarahcodes" }), 404, "not_found");

    actAs("kizilaykahve");
    const own = await placeOrder({ business: "KizilayKahve" });
    expectInvalid(own, "business");
    expect(own.body.error.details[0].message).toBe(
      "You can't order from your own business"
    );

    actAs("newcomer");
    const broke = await placeOrder();
    expectError(broke, 402, "insufficient_funds");

    actAs("sarahcodes");
    state().wallet.frozen.add("sarahcodes");
    expectError(await placeOrder(), 403, "wallet_frozen");
  });

  it("validates the body and the key", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ business: "not a user" }, "business"],
      [{ items: [] }, "items"],
      [{ items: "latte" }, "items"],
      [
        {
          items: Array.from({ length: 11 }, (_, i) => ({
            productId: `p-${i}`,
            quantity: 1,
          })),
        },
        "items",
      ],
      [{ items: [{ productId: LATTE, quantity: 0 }] }, "items.0.quantity"],
      [{ items: [{ productId: LATTE, quantity: 21 }] }, "items.0.quantity"],
      [{ items: [{ productId: LATTE, quantity: 1.5 }] }, "items.0.quantity"],
      [
        { items: [{ productId: "drafts.x", quantity: 1 }] },
        "items.0.productId",
      ],
      [
        {
          items: [
            { productId: LATTE, quantity: 1 },
            { productId: LATTE, quantity: 2 },
          ],
        },
        "items.1.productId",
      ],
      [{ deliveryPlaceId: "moon" }, "deliveryPlaceId"],
      [{ note: "x".repeat(141) }, "note"],
      [{ expectedTotal: 6.5 }, "expectedTotal"],
      [{ expectedTotal: "650" }, "expectedTotal"],
      [{ expectedTotal: -1 }, "expectedTotal"],
      [{ expectedTotal: undefined }, "expectedTotal"],
      [{ sourceTweetId: "drafts.seed-t22" }, "sourceTweetId"],
    ];
    for (const [fields, path] of cases) {
      expectInvalid(await placeOrder(fields), path, JSON.stringify(fields));
    }

    const noKey = await call(api.orders, {
      method: "POST",
      ...json(orderBody()),
    });
    expectInvalid(noKey, "Idempotency-Key");
    const badKey = await call(api.orders, keyed(orderBody(), "short"));
    expectInvalid(badKey, "Idempotency-Key");
    // A note of exactly 140 characters, and a blank one, are fine.
    expect((await placeOrder({ note: "x".repeat(140) })).statusCode).toBe(201);
    expect((await placeOrder({ note: "   " })).body.order.note).toBeNull();
  });

  it("ignores identity fields and Tweets that don't exist", async () => {
    const res = await placeOrder({
      buyer: { username: "sarahcodes", fullname: "Sarah", image: null },
      from: "sarahcodes",
      username: "sarahcodes",
      placedBy: "demo_bot",
      sourceTweetId: "no-such-tweet",
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.order).toMatchObject({
      buyer: { username: "illlhanozkan" },
      placedBy: "buyer",
      sourceTweetId: null,
    });
  });
});

describe("GET /api/orders", () => {
  it("lists your orders, newest first, with the server clock", async () => {
    // Orders placed in the same millisecond tie on placedAt and then sort
    // by id, so a fast machine could list them either way round.
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() });
    const first = await placed();
    vi.setSystemTime(Date.now() + 1_000);
    const second = await placed({
      business: "superapp",
      items: [{ productId: "seed-p-sa-stickers", quantity: 1 }],
      expectedTotal: 600,
    });

    const res = await call(api.orders);
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(isRecent(res.body.serverNow)).toBe(true);
    const ids = res.body.items.map((order: IOrder) => order.id);
    expect(ids.slice(0, 2)).toEqual([second.id, first.id]);
    // seed-o01 is the demo user's delivered order.
    expect(ids).toContain("seed-o01");
    expect(ids).not.toContain("seed-o03");

    const active = await call(api.orders, { query: { state: "active" } });
    expect(active.body.items.map((o: IOrder) => o.id)).toEqual([
      second.id,
      first.id,
    ]);
    const past = await call(api.orders, {
      query: { as: "buyer", state: "past" },
    });
    expect(past.body.items.map((o: IOrder) => o.id)).toContain("seed-o01");

    const atSuperapp = await call(api.orders, {
      query: { business: "superapp" },
    });
    expect(atSuperapp.body.items.map((o: IOrder) => o.id)).toEqual([second.id]);

    const page = await call(api.orders, { query: { limit: "1" } });
    expect(page.body.items).toHaveLength(1);
    const next = await call(api.orders, {
      query: { limit: "1", cursor: page.body.nextCursor },
    });
    expect(next.body.items[0].id).toBe(first.id);
  });

  it("lists a business's orders for the people who run it, 404 for others", async () => {
    const res = await call(api.orders, {
      query: { as: "business", business: "SuperApp", state: "active" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.items.map((o: IOrder) => o.id)).toEqual(["seed-o03"]);

    expectError(
      await call(api.orders, {
        query: { as: "business", business: "kizilaykahve" },
      }),
      404,
      "not_found"
    );
    actAs("sarahcodes");
    expectError(
      await call(api.orders, {
        query: { as: "business", business: "superapp" },
      }),
      404,
      "not_found"
    );
  });

  it("validates the query", async () => {
    const cases: [Record<string, string | string[]>, string][] = [
      [{ as: "driver" }, "as"],
      [{ as: "business" }, "business"],
      [{ business: "not a user" }, "business"],
      [{ state: "done" }, "state"],
      [{ limit: "0" }, "limit"],
      [{ limit: "51" }, "limit"],
      [{ cursor: "nope" }, "cursor"],
      [{ as: ["buyer", "business"] }, "as"],
    ];
    for (const [query, path] of cases) {
      expectInvalid(
        await call(api.orders, { query }),
        path,
        JSON.stringify(query)
      );
    }
  });
});

describe("GET /api/orders/:id", () => {
  it("shows an order to its buyer and the people who run its business", async () => {
    const mine = await call(api.order, { query: { id: "seed-o01" } });
    expect(mine.statusCode).toBe(200);
    expect(mine.headers["cache-control"]).toBe("private, no-store");
    expect(mine.body.order).toMatchObject({
      code: "K7Q2",
      status: "delivered",
    });
    expect(isRecent(mine.body.serverNow)).toBe(true);

    // The demo user manages @superapp, so Marco's order is visible too.
    expect(
      (await call(api.order, { query: { id: "seed-o03" } })).body.order.code
    ).toBe("M2X9");

    actAs("devmarco");
    expect(
      (await call(api.order, { query: { id: "seed-o03" } })).statusCode
    ).toBe(200);
  });

  it("answers 404 to everyone else, and for keys that aren't plain", async () => {
    actAs("sarahcodes");
    for (const id of [
      "seed-o01",
      "seed-o03",
      "no-such-order",
      "private.seed-o01",
    ]) {
      const res = await call(api.order, { query: { id } });
      expectError(res, 404, "not_found", id);
      expect(res.body.error.message, id).toBe("Order not found");
    }
  });
});

describe("POST /api/orders/:id/cancel", () => {
  it("refunds the buyer, and repeating it changes nothing", async () => {
    const before = await myBalance();
    const order = await placed();

    const res = await cancel(order.id, "buyer");
    expect(res.statusCode).toBe(200);
    expect(res.body.order).toMatchObject({
      status: "cancelled",
      cancelledBy: "buyer",
      refundTransferId: `refund-${order.paymentTransferId}`,
    });
    expect(res.body.wallet.balance).toBe(before);
    expect(isRecent(res.body.serverNow)).toBe(true);

    const again = await cancel(order.id, "buyer");
    expect(again.statusCode).toBe(200);
    expect(again.body.order).toEqual(res.body.order);
    expect(again.body.wallet.balance).toBe(before);
    // The business side, too, finds it already cancelled.
    actAs("kizilaykahve");
    const business = await cancel(order.id, "business");
    expect(business.statusCode).toBe(200);
    expect(business.body.order).toEqual(res.body.order);
    actAs("illlhanozkan");
    expect(await myBalance()).toBe(before);
  });

  it("lets the business cancel and refund until delivery, then answers 409", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() });
    actAs("sarahcodes");
    const sarahsOrder = await placed({
      business: "superapp",
      items: [{ productId: "seed-p-sa-stickers", quantity: 1 }],
      expectedTotal: 600,
    });
    const atKizilay = await placed();

    vi.setSystemTime(Date.now() + 61_000);
    const late = await cancel(atKizilay.id, "buyer");
    expectError(late, 409, "invalid_state");
    expect(late.body.error.message).toBe(
      "Kızılay Kahve already accepted this order, so it can't be cancelled"
    );

    // The demo user runs @superapp: its wallet isn't theirs, but the refund is.
    actAs("illlhanozkan");
    const res = await cancel(sarahsOrder.id, "business");
    expect(res.statusCode).toBe(200);
    expect(res.body.order.cancelledBy).toBe("business");
    expect(res.body.wallet.username).toBe("illlhanozkan");

    vi.setSystemTime(Date.now() + 10 * 60_000);
    actAs("kizilaykahve");
    expectError(await cancel(atKizilay.id, "business"), 409, "invalid_state");
  });

  it("is 403 for the wrong side and 404 for everyone else", async () => {
    const order = await placed({
      business: "superapp",
      items: [{ productId: "seed-p-sa-stickers", quantity: 1 }],
      expectedTotal: 600,
    });
    // The demo user bought it and runs @superapp: both sides are theirs.
    actAs("superapp");
    const asBuyer = await cancel(order.id, "buyer");
    expectError(asBuyer, 403, "forbidden");
    expect(asBuyer.body.error.message).toBe(
      "Only the buyer can cancel as the buyer"
    );

    actAs("devmarco");
    expectError(await cancel(order.id, "business"), 404, "not_found");
    expectError(await cancel("seed-o03", "business"), 403, "forbidden");
    expectError(await cancel("no-such-order", "buyer"), 404, "not_found");

    expectInvalid(await cancel(order.id, "driver"), "as");
    expectInvalid(await cancel(order.id, undefined), "as");
  });
});

describe("POST /api/businesses/:username/demo-orders", () => {
  it("simulates a customer order for a manager, replaying a key", async () => {
    const res = await simulate("superapp", "demo-key-0001");
    expect(res.statusCode).toBe(201);
    expect(res.headers.location).toBe(`/api/orders/${res.body.order.id}`);
    expect(res.body.order).toMatchObject({
      placedBy: "demo_bot",
      buyer: { username: "demo_customer" },
      business: { username: "superapp" },
    });
    expect(isRecent(res.body.serverNow)).toBe(true);

    const again = await simulate("superapp", "demo-key-0001");
    expect(again.statusCode).toBe(201);
    expect(again.headers["idempotent-replayed"]).toBe("true");
    expect(again.body.order.id).toBe(res.body.order.id);

    // It shows on the business's board.
    const board = await call(api.orders, {
      query: { as: "business", business: "superapp", state: "active" },
    });
    expect(board.body.items[0].id).toBe(res.body.order.id);
  });

  it("is 404 for anyone who doesn't run the business", async () => {
    for (const username of ["kizilaykahve", "sarahcodes", "nobody_here"]) {
      expectError(await simulate(username), 404, "not_found", username);
    }
    actAs("sarahcodes");
    expectError(await simulate("superapp"), 404, "not_found");
  });

  it("needs a key and an orderable business", async () => {
    const noKey = await call(api.demoOrders, {
      method: "POST",
      query: { username: "superapp" },
    });
    expectInvalid(noKey, "Idempotency-Key");

    state().business.profiles.get("superapp")!.acceptingOrders = false;
    expectError(await simulate(), 422, "unavailable");
  });

  it("allows 5 an hour per user (429 with Retry-After)", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await simulate()).statusCode, `demo ${i + 1}`).toBe(201);
    }
    const limited = await simulate();
    expectError(limited, 429, "rate_limited");
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
    // Every user has a budget of their own.
    actAs("kizilaykahve");
    expect((await simulate("kizilaykahve")).statusCode).toBe(201);
  });
});

describe("GET /api/businesses/:username/summary", () => {
  it("summarizes today's orders and the business's wallet for its managers", async () => {
    // seed-o03 was placed 40 minutes ago: in the last hour whatever the
    // time of day (it is yesterday's for the first 40 minutes of a day).
    const lastHour = new Date(Date.now() - 3_600_000).toISOString();
    expect(
      (
        await call(api.summary, {
          query: { username: "superapp", since: lastHour },
        })
      ).body.summary.orders
    ).toBeGreaterThanOrEqual(1);

    const before = (
      await call(api.summary, { query: { username: "superapp" } })
    ).body;
    expect(before.wallet.username).toBe("superapp");
    expect(isRecent(before.serverNow)).toBe(true);
    // "Today" starts at midnight in the business's time zone.
    expect(before.since).toBe(
      startOfLocalDay(new Date(before.serverNow), "Europe/Istanbul")
    );

    actAs("sarahcodes");
    await placed({
      business: "superapp",
      items: [{ productId: "seed-p-sa-stickers", quantity: 1 }],
      expectedTotal: 600,
    });
    actAs("illlhanozkan");
    const after = await call(api.summary, { query: { username: "superapp" } });
    expect(after.statusCode).toBe(200);
    expect(after.headers["cache-control"]).toBe("private, no-store");
    expect(after.body.summary).toMatchObject({
      orders: before.summary.orders + 1,
      revenue: before.summary.revenue + 600,
      pending: before.summary.pending + 600,
    });
    expect(after.body.wallet.pending).toBe(before.wallet.pending + 600);

    const since = new Date(Date.now() + 60_000).toISOString();
    expect(
      (await call(api.summary, { query: { username: "superapp", since } })).body
    ).toMatchObject({
      since,
      summary: { orders: 0, revenue: 0, pending: 0, fromTweets: 0 },
    });
  });

  it("is 404 for others and validates `since`", async () => {
    expectError(
      await call(api.summary, { query: { username: "kizilaykahve" } }),
      404,
      "not_found"
    );
    expectInvalid(
      await call(api.summary, {
        query: { username: "superapp", since: "yesterday" },
      }),
      "since"
    );
  });
});

describe("write protections and gating", () => {
  const writes = (): [string, Handler, MockRequest][] => [
    ["place", api.orders, keyed(orderBody())],
    [
      "cancel",
      api.cancel,
      {
        method: "POST",
        query: { id: "seed-o03" },
        ...json({ as: "business" }),
      },
    ],
    [
      "demo",
      api.demoOrders,
      {
        method: "POST",
        query: { username: "superapp" },
        headers: { "idempotency-key": newKey() },
      },
    ],
  ];

  it("rejects every write with 403 read_only in READ_ONLY mode", async () => {
    vi.stubEnv("READ_ONLY", "true");
    for (const [name, handler, request] of writes()) {
      expectError(await call(handler, request), 403, "read_only", name);
    }
    expect(
      (await call(api.order, { query: { id: "seed-o03" } })).body.order.status
    ).not.toBe("cancelled");
    expect((await call(api.orders)).statusCode).toBe(200);
  });

  it("rejects cross-origin writes", async () => {
    for (const [name, handler, request] of writes()) {
      const res = await call(handler, {
        ...request,
        headers: { ...request.headers, origin: "https://evil.example" },
      });
      expectError(res, 403, "forbidden", name);
    }
  });

  it("shares the money budget with the wallet (429 with Retry-After)", async () => {
    for (let i = 0; i < 12; i++) {
      expect((await placeOrder()).statusCode, `order ${i + 1}`).toBeLessThan(
        429
      );
    }
    const limited = await placeOrder();
    expectError(limited, 429, "rate_limited");
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("turns every route into a 404 with DISABLED_FEATURES=orders", async () => {
    vi.stubEnv("DISABLED_FEATURES", "orders");
    const reads: [string, Handler, MockRequest][] = [
      ["list", api.orders, {}],
      ["get", api.order, { query: { id: "seed-o01" } }],
      ["summary", api.summary, { query: { username: "superapp" } }],
    ];
    for (const [name, handler, request] of [...reads, ...writes()]) {
      const res = await call(handler, request);
      expectError(res, 404, "not_found", name);
      expect(res.body.error.message, name).toBe("This feature is turned off");
    }
    expect((await call(api.me)).body.features.orders).toBe(false);
  });

  it.each(["shop", "wallet"])(
    "turns every route into a 404 with DISABLED_FEATURES=%s, moving nothing",
    async (required) => {
      // Orders sell the shop's products for wallet credits: without either
      // an order would lead to 404 menus or charge a wallet nobody can see.
      vi.stubEnv("DISABLED_FEATURES", required);
      const wallet = state().wallet;
      const before = {
        balances: new Map(wallet.balances),
        transfers: wallet.transfers.size,
        orders: state().orders.orders.size,
      };

      for (const [name, handler, request] of writes()) {
        const res = await call(handler, request);
        expectError(res, 404, "not_found", name);
        expect(res.body.error.message, name).toBe("This feature is turned off");
      }
      expectError(await call(api.orders), 404, "not_found");
      expect(wallet.balances).toEqual(before.balances);
      expect(wallet.transfers.size).toBe(before.transfers);
      expect(state().orders.orders.size).toBe(before.orders);
      expect((await call(api.me)).body.features).toMatchObject({
        [required]: false,
        orders: false,
      });
    }
  );

  it("answers 503 while the data source can't serve orders", async () => {
    vi.stubEnv("DATA_SOURCE", "sanity");
    vi.stubEnv("SANITY_PROJECT_ID", "testproject");
    vi.stubEnv("SANITY_API_TOKEN", "");
    const res = await call(api.orders);
    expectError(res, 503, "service_unavailable");
    expect(res.body.error.message).toBe(
      "Orders needs SANITY_API_TOKEN on this deployment"
    );
  });

  it("parses bodies only on routes that take one, and says which methods exist", async () => {
    const config = async (path: string) => {
      const specifier = "../../" + path;
      return (await import(specifier)).config;
    };
    for (const path of [ROUTES.orders, ROUTES.cancel]) {
      expect(await config(path), path).toEqual({
        api: { bodyParser: { sizeLimit: "16kb" } },
      });
    }
    for (const path of [ROUTES.order, ROUTES.demoOrders, ROUTES.summary]) {
      expect(await config(path), path).toEqual({ api: { bodyParser: false } });
    }

    const methods: [string, Handler, string][] = [
      ["orders", api.orders, "GET, POST, HEAD, OPTIONS"],
      ["order", api.order, "GET, HEAD, OPTIONS"],
      ["cancel", api.cancel, "POST, OPTIONS"],
      ["demo", api.demoOrders, "POST, OPTIONS"],
      ["summary", api.summary, "GET, HEAD, OPTIONS"],
    ];
    for (const [name, handler, allow] of methods) {
      const res = await call(handler, { method: "DELETE" });
      expectError(res, 405, "method_not_allowed", name);
      expect(res.headers.allow, name).toBe(allow);
    }
  });
});

describe("GET /api/me", () => {
  it("reports orders as on", async () => {
    expect((await call(api.me)).body.features.orders).toBe(true);
  });
});
