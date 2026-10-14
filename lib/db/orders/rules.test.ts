import { describe, expect, it } from "vitest";

import { businessStatus } from "../../superapp/business";
import { formatAmount } from "../../superapp/money";
import {
  isActiveOrder,
  ORDER_CODE_PATTERN,
  orderAt,
  orderCode,
  orderProgress,
  orderSchedule,
  priceOrder,
  stableHash,
  startOfLocalDay,
} from "../../superapp/orders";
import { canCancelOrder, canViewOrder } from "../../superapp/policy/orders";
import { IBusiness } from "../../../types/Business";
import { IOrder } from "../../../types/Order";
import { IProduct } from "../../../types/Shop";
import {
  InvalidStateError,
  LimitExceededError,
  NotFoundError,
  PriceChangedError,
  UnavailableError,
} from "../errors";
import {
  demoLines,
  demoPlace,
  planCancel,
  planDemoOrder,
  planOrder,
} from "./plan";
import { DEMO_CUSTOMER, OrderRecord, toOrder } from "./records";
import { NewOrder } from "./types";
import {
  orderNotifications,
  purchasedProductIds,
  summarizeOrders,
  toLiveActivity,
} from "./views";

// The orders lane's pure rules (lib/superapp/orders.ts, its policy, and the
// planners and views in this folder). They live here because the lane's
// scope has no test path under lib/superapp/.

const NOW = new Date("2026-10-08T12:00:00.000Z");
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const at = (ms: number) => new Date(NOW.getTime() + ms);
const iso = (ms: number) => at(ms).toISOString();

const me = { username: "alice_test", fullname: "Alice Test", image: null };

const business = (fields: Partial<IBusiness> = {}): IBusiness => {
  const hours = fields.hours ?? {
    opens: "00:00",
    closes: "00:00",
    timeZone: "Europe/Istanbul",
  };
  const accepting = fields.acceptingOrders ?? true;
  return {
    username: "kizilaykahve",
    fullname: "Kızılay Kahve",
    image: "/avatars/kizilaykahve.svg",
    banner: null,
    category: "cafe",
    description: null,
    placeId: "kizilay",
    address: "Kızılay",
    hours,
    acceptingOrders: accepting,
    prepMinutes: 3,
    deliveryMinutes: 6,
    deliveryFee: 150,
    minimumOrder: 300,
    greeting: null,
    managers: ["illlhanozkan"],
    status: businessStatus(hours, accepting, false, NOW),
    etaMinutes: [9, 12],
    ...fields,
  };
};

const product = (id: string, price: number, fields: Partial<IProduct> = {}) =>
  ({
    id,
    business: "kizilaykahve",
    section: "Coffee",
    name: id,
    description: null,
    price,
    image: null,
    imageAlt: null,
    available: true,
    position: 1,
    ...fields,
  }) satisfies IProduct;

const latte = product("latte", 500, { name: "Pistachio latte" });
const simit = product("simit", 250, { name: "Simit", section: "Bakery" });

const newOrder = (fields: Partial<NewOrder> = {}): NewOrder => ({
  operationId: "order-abc",
  fingerprint: "hash",
  buyer: me,
  business: "kizilaykahve",
  lines: [
    { productId: "latte", quantity: 1 },
    { productId: "simit", quantity: 1 },
  ],
  deliveryPlaceId: "tunali",
  note: null,
  expectedTotal: 900,
  sourceTweetId: null,
  ...fields,
});

const context = (fields: Partial<Parameters<typeof planOrder>[1]> = {}) => ({
  now: NOW,
  timeScale: 1,
  business: business(),
  products: [latte, simit],
  activeOrders: 0,
  ...fields,
});

describe("priceOrder", () => {
  const line = (productId: string, unitPrice: number, quantity: number) => ({
    productId,
    name: productId,
    unitPrice,
    quantity,
  });

  it("adds the lines and the delivery fee", () => {
    const price = priceOrder([line("latte", 500, 1), line("simit", 250, 2)], {
      deliveryFee: 150,
      minimumOrder: 300,
    });
    expect(price).toEqual({
      lines: [
        {
          productId: "latte",
          name: "latte",
          unitPrice: 500,
          quantity: 1,
          total: 500,
        },
        {
          productId: "simit",
          name: "simit",
          unitPrice: 250,
          quantity: 2,
          total: 500,
        },
      ],
      subtotal: 1000,
      deliveryFee: 150,
      total: 1150,
      belowMinimum: 0,
      overMaximum: false,
    });
  });

  it("applies the minimum to the subtotal, not the fee", () => {
    const fees = { deliveryFee: 150, minimumOrder: 300 };
    // Simit alone is 2.50: with the fee it is 4.00, still short of 3.00 of food.
    expect(priceOrder([line("simit", 250, 1)], fees)).toMatchObject({
      subtotal: 250,
      total: 400,
      belowMinimum: 50,
    });
    expect(priceOrder([line("simit", 250, 2)], fees).belowMinimum).toBe(0);
    expect(
      priceOrder([line("x", 10, 1)], { deliveryFee: 0, minimumOrder: 0 })
        .belowMinimum
    ).toBe(0);
  });

  it("allows exactly 200.00 and no more", () => {
    const fees = { deliveryFee: 300, minimumOrder: 0 };
    expect(priceOrder([line("mug", 1_970, 10)], fees)).toMatchObject({
      total: 20_000,
      overMaximum: false,
    });
    expect(
      priceOrder([line("mug", 1_970, 10), line("x", 1, 1)], fees)
    ).toMatchObject({ total: 20_001, overMaximum: true });
  });

  it("stays in whole cents: nothing is ever rounded", () => {
    // In floating-point credits 0.1 × 3 is 0.30000000000000004.
    const price = priceOrder(
      [line("a", 10, 3), line("b", 350, 3), line("c", 1_999, 7)],
      { deliveryFee: 150, minimumOrder: 0 }
    );
    expect(price.subtotal).toBe(30 + 1_050 + 13_993);
    expect(Number.isSafeInteger(price.total)).toBe(true);
    expect(formatAmount(price.total)).toBe("152.23");
  });

  it("refuses prices and quantities that aren't whole", () => {
    const fees = { deliveryFee: 0, minimumOrder: 0 };
    for (const bad of [
      line("a", 2.5, 1),
      line("a", -100, 1),
      line("a", 100, 0),
      line("a", 100, 1.5),
    ]) {
      expect(() => priceOrder([bad], fees), JSON.stringify(bad)).toThrow();
    }
  });
});

describe("orderSchedule", () => {
  const superapp = { prepMinutes: 60, deliveryMinutes: 120 };
  const cafe = { prepMinutes: 3, deliveryMinutes: 6 };

  it("takes a minute to accept, then prep, then delivery, at scale 1", () => {
    expect(orderSchedule(NOW, cafe, 1)).toEqual({
      placedAt: iso(0),
      acceptAt: iso(MINUTE),
      onTheWayAt: iso(4 * MINUTE),
      deliverAt: iso(10 * MINUTE),
    });
    // seed-o03: placed 40 minutes ago, delivered 141 minutes from now.
    expect(orderSchedule(NOW, superapp).deliverAt).toBe(iso(181 * MINUTE));
  });

  it("speeds demo minutes up at scale 60, but gives the buyer 15 real seconds", () => {
    expect(orderSchedule(NOW, cafe, 60)).toEqual({
      placedAt: iso(0),
      acceptAt: iso(15 * SECOND),
      onTheWayAt: iso(18 * SECOND),
      deliverAt: iso(24 * SECOND),
    });
    expect(orderSchedule(NOW, superapp, 60).deliverAt).toBe(
      iso(15 * SECOND + 3 * MINUTE)
    );
  });

  it("keeps the 15 s floor at every scale", () => {
    for (const scale of [4, 5, 600]) {
      expect(orderSchedule(NOW, cafe, scale).acceptAt, String(scale)).toBe(
        iso(Math.max(MINUTE / scale, 15 * SECOND))
      );
    }
    expect(orderSchedule(NOW, cafe, 2).acceptAt).toBe(iso(30 * SECOND));
  });

  it("handles businesses with no prep or delivery time", () => {
    const s = orderSchedule(NOW, { prepMinutes: 0, deliveryMinutes: 0 });
    expect(s.onTheWayAt).toBe(s.acceptAt);
    expect(s.deliverAt).toBe(s.acceptAt);
  });
});

describe("orderProgress", () => {
  const times = {
    placedAt: iso(0),
    acceptAt: iso(MINUTE),
    onTheWayAt: iso(4 * MINUTE),
    deliverAt: iso(10 * MINUTE),
    cancelledAt: null,
  };

  it("moves through the stages with the clock", () => {
    const cases: [number, string, string | null][] = [
      [0, "placed", iso(MINUTE)],
      [MINUTE - 1, "placed", iso(MINUTE)],
      [MINUTE, "accepted", iso(4 * MINUTE)],
      [5 * MINUTE, "on_the_way", iso(10 * MINUTE)],
      [10 * MINUTE, "delivered", null],
      [24 * 60 * MINUTE, "delivered", null],
    ];
    for (const [offset, status, next] of cases) {
      const progress = orderProgress(times, at(offset));
      expect(progress.status, String(offset)).toBe(status);
      expect(progress.nextChangeAt, String(offset)).toBe(next);
      expect(progress.eta, String(offset)).toBe(
        status === "delivered" ? null : times.deliverAt
      );
    }
    expect(orderProgress(times, at(5 * MINUTE)).stages).toEqual([
      { status: "placed", label: "Placed", at: iso(0), reached: true },
      { status: "accepted", label: "Accepted", at: iso(MINUTE), reached: true },
      {
        status: "on_the_way",
        label: "On the way",
        at: iso(4 * MINUTE),
        reached: true,
      },
      {
        status: "delivered",
        label: "Delivered",
        at: iso(10 * MINUTE),
        reached: false,
      },
    ]);
  });

  it("lets the buyer cancel until acceptance and the business until delivery", () => {
    const can = (offset: number) => orderProgress(times, at(offset)).canCancel;
    expect(can(0)).toEqual({ buyer: true, business: true });
    expect(can(MINUTE - 1)).toEqual({ buyer: true, business: true });
    expect(can(MINUTE)).toEqual({ buyer: false, business: true });
    expect(can(10 * MINUTE - 1)).toEqual({ buyer: false, business: true });
    expect(can(10 * MINUTE)).toEqual({ buyer: false, business: false });
  });

  it("ends the stages at a cancellation", () => {
    const cancelled = { ...times, cancelledAt: iso(2 * MINUTE) };
    const progress = orderProgress(cancelled, at(30 * MINUTE));
    expect(progress).toMatchObject({
      status: "cancelled",
      eta: null,
      nextChangeAt: null,
      canCancel: { buyer: false, business: false },
    });
    expect(progress.stages.map((stage) => stage.status)).toEqual([
      "placed",
      "accepted",
      "cancelled",
    ]);
    expect(isActiveOrder(cancelled, at(0))).toBe(false);
    expect(isActiveOrder(times, at(10 * MINUTE - 1))).toBe(true);
    expect(isActiveOrder(times, at(10 * MINUTE))).toBe(false);
  });

  it("re-derives an order on the client's server clock", () => {
    const record: OrderRecord = {
      ...planOrder(newOrder(), context()).record,
    };
    const order = toOrder(record, NOW);
    expect(order.status).toBe("placed");
    expect(orderAt(order, at(20 * MINUTE))).toEqual(
      toOrder(record, at(20 * MINUTE))
    );
  });
});

describe("order codes", () => {
  it("are 4 unambiguous characters, stable per id", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const code = orderCode(`order-${i.toString(16).padStart(32, "0")}`);
      expect(code).toMatch(ORDER_CODE_PATTERN);
      expect(code).not.toMatch(/[01IO]/);
      codes.add(code);
    }
    expect(codes.size).toBeGreaterThan(490);
    expect(orderCode("order-abc")).toBe(orderCode("order-abc"));
    expect(ORDER_CODE_PATTERN.test("K7Q2")).toBe(true);
    expect(ORDER_CODE_PATTERN.test("K7Q0")).toBe(false);
  });

  it("hash strings the same way everywhere", () => {
    expect(stableHash("")).toBe(0x811c9dc5);
    expect(stableHash("a")).toBe(0xe40c292c);
  });
});

describe("startOfLocalDay", () => {
  it("is local midnight in the business's zone", () => {
    // 15:00 in Istanbul (UTC+3) → 00:00 the same local day.
    expect(startOfLocalDay(NOW, "Europe/Istanbul")).toBe(
      "2026-10-07T21:00:00.000Z"
    );
    // 01:30 on the 9th in Istanbul is still the 8th in UTC.
    expect(
      startOfLocalDay(new Date("2026-10-08T22:30:45.123Z"), "Europe/Istanbul")
    ).toBe("2026-10-08T21:00:00.000Z");
    expect(startOfLocalDay(NOW, "UTC")).toBe("2026-10-08T00:00:00.000Z");
  });
});

describe("order policy", () => {
  const order = {
    buyer: { username: "SarahCodes", fullname: "Sarah", image: null },
    business: {
      username: "superapp",
      fullname: "Twitter SuperApp",
      image: null,
      category: "shop" as const,
    },
  };
  const running = { username: "superapp", managers: ["illlhanozkan"] };

  it("shows an order to its buyer and the people who run its business", () => {
    expect(canViewOrder("sarahcodes", order, running)).toBe(true);
    expect(canViewOrder("SUPERAPP", order, running)).toBe(true);
    expect(canViewOrder("Illlhanozkan", order, running)).toBe(true);
    expect(canViewOrder("devmarco", order, running)).toBe(false);
    // The business is gone: only the account itself still runs it.
    expect(canViewOrder("illlhanozkan", order, null)).toBe(false);
    expect(canViewOrder("superapp", order, null)).toBe(true);
  });

  it("lets each side cancel only as itself", () => {
    expect(canCancelOrder("sarahcodes", order, running, "buyer")).toBe(true);
    expect(canCancelOrder("sarahcodes", order, running, "business")).toBe(
      false
    );
    expect(canCancelOrder("illlhanozkan", order, running, "business")).toBe(
      true
    );
    expect(canCancelOrder("illlhanozkan", order, running, "buyer")).toBe(false);
    expect(canCancelOrder("devmarco", order, running, "buyer")).toBe(false);
  });
});

describe("planOrder", () => {
  it("plans the order and its payment, held until delivery", () => {
    const { record, transfers } = planOrder(
      newOrder({ note: "Oat milk", sourceTweetId: "seed-t22" }),
      context()
    );
    expect(record).toMatchObject({
      id: "order-abc",
      code: orderCode("order-abc"),
      buyer: me,
      placedBy: "buyer",
      business: {
        username: "kizilaykahve",
        fullname: "Kızılay Kahve",
        category: "cafe",
      },
      subtotal: 750,
      deliveryFee: 150,
      total: 900,
      deliveryPlaceId: "tunali",
      note: "Oat milk",
      sourceTweetId: "seed-t22",
      placedAt: iso(0),
      deliverAt: iso(10 * MINUTE),
      cancelledAt: null,
      paymentTransferId: "order-abc-1",
      refundTransferId: null,
      requestHash: "hash",
    });
    expect(record.lines.map((line) => line.name)).toEqual([
      "Pistachio latte",
      "Simit",
    ]);
    expect(transfers).toEqual([
      {
        id: "order-abc-1",
        kind: "order",
        from: me,
        to: {
          username: "kizilaykahve",
          fullname: "Kızılay Kahve",
          image: "/avatars/kizilaykahve.svg",
        },
        amount: 900,
        note: null,
        context: { type: "order", id: "order-abc", code: record.code },
        holdUntil: iso(10 * MINUTE),
        reverses: null,
      },
    ]);
  });

  it("schedules with the time scale", () => {
    expect(
      planOrder(newOrder(), context({ timeScale: 60 })).record.acceptAt
    ).toBe(iso(15 * SECOND));
  });

  it("explains every reason the business can't take it", () => {
    const refuse = (b: IBusiness) =>
      expect(() => planOrder(newOrder(), context({ business: b })));
    refuse(
      business({ status: businessStatus(business().hours, true, true, NOW) })
    ).toThrow(
      new UnavailableError("Kızılay Kahve can't take orders right now")
    );
    refuse(business({ acceptingOrders: false })).toThrow(
      "Kızılay Kahve isn't taking orders right now"
    );
    const hours = {
      opens: "18:00",
      closes: "23:00",
      timeZone: "Europe/Istanbul",
    };
    refuse(business({ hours })).toThrow(
      "Kızılay Kahve is closed · Opens 18:00"
    );
  });

  it("names the products that are sold out or gone", () => {
    const soldOut = { ...simit, available: false };
    const fail = (lines: NewOrder["lines"], products: IProduct[]) => {
      try {
        planOrder(newOrder({ lines }), context({ products }));
      } catch (error) {
        return error as UnavailableError;
      }
      throw new Error("expected UnavailableError");
    };

    const one = fail(newOrder().lines, [latte, soldOut]);
    expect(one).toBeInstanceOf(UnavailableError);
    expect(one.message).toBe("Simit is sold out");
    expect(one.productIds).toEqual(["simit"]);

    const gone = fail([{ productId: "nope", quantity: 1 }], [latte]);
    expect(gone.message).toBe("This item is no longer available");
    expect(gone.productIds).toEqual(["nope"]);

    // Another business's product isn't on this menu.
    const elsewhere = product("lahmacun", 400, { business: "lahmacunlab" });
    const both = fail(
      [
        { productId: "lahmacun", quantity: 1 },
        { productId: "simit", quantity: 1 },
        { productId: "latte", quantity: 1 },
      ],
      [latte, soldOut, elsewhere]
    );
    expect(both.message).toBe("Some items are sold out or no longer available");
    expect(both.productIds).toEqual(["lahmacun", "simit"]);
  });

  it("refuses an out-of-date total with both amounts", () => {
    expect(() =>
      planOrder(newOrder({ expectedTotal: 850 }), context())
    ).toThrow(PriceChangedError);
    try {
      planOrder(newOrder({ expectedTotal: 850 }), context());
    } catch (error) {
      expect(error).toMatchObject({ expected: 850, actual: 900 });
    }
  });

  it("enforces the minimum, the maximum and 5 orders in progress", () => {
    expect(() =>
      planOrder(
        newOrder({
          lines: [{ productId: "simit", quantity: 1 }],
          expectedTotal: 400,
        }),
        context()
      )
    ).toThrow(
      new UnavailableError("The minimum order at Kızılay Kahve is 3.00 credits")
    );

    const big = product("big", 10_000);
    expect(() =>
      planOrder(
        newOrder({
          lines: [{ productId: "big", quantity: 2 }],
          expectedTotal: 20_150,
        }),
        context({ products: [big] })
      )
    ).toThrow(new LimitExceededError("An order can be at most 200.00 credits"));

    expect(() =>
      planOrder(newOrder(), context({ activeOrders: 4 }))
    ).not.toThrow();
    expect(() => planOrder(newOrder(), context({ activeOrders: 5 }))).toThrow(
      new LimitExceededError("You can have 5 orders in progress at a time")
    );
  });

  it("refuses unknown businesses, your own business and bad lines", () => {
    expect(() => planOrder(newOrder(), context({ business: null }))).toThrow(
      NotFoundError
    );
    expect(() =>
      planOrder(
        newOrder({ buyer: { ...me, username: "KizilayKahve" } }),
        context()
      )
    ).toThrow(new InvalidStateError("You can't order from your own business"));
    expect(() =>
      planOrder(
        newOrder({ lines: [{ productId: "latte", quantity: 21 }] }),
        context()
      )
    ).toThrow(LimitExceededError);
    expect(() =>
      planOrder(
        newOrder({
          lines: Array.from({ length: 11 }, (_, i) => ({
            productId: `p${i}`,
            quantity: 1,
          })),
        }),
        context()
      )
    ).toThrow(LimitExceededError);
    expect(() => planOrder(newOrder({ lines: [] }), context())).toThrow();
    expect(() =>
      planOrder(
        newOrder({
          lines: [
            { productId: "latte", quantity: 1 },
            { productId: "latte", quantity: 1 },
          ],
        }),
        context()
      )
    ).toThrow("Each product can be listed only once");
  });
});

describe("demo orders", () => {
  const menu = [
    latte,
    simit,
    product("coldbrew", 450),
    product("hoodie", 3_500, { available: false }),
  ];
  const demoContext = (fields = {}) => ({
    now: NOW,
    timeScale: 1,
    business: business(),
    products: menu,
    customer: DEMO_CUSTOMER,
    ...fields,
  });

  it("funds demo_customer with exactly the total, then pays it, held", () => {
    const { record, transfers } = planDemoOrder(
      {
        operationId: "order-demo",
        fingerprint: "h",
        business: "kizilaykahve",
        requestedBy: me,
      },
      demoContext()
    );
    expect(record).toMatchObject({
      placedBy: "demo_bot",
      buyer: DEMO_CUSTOMER,
      note: null,
      sourceTweetId: null,
      paymentTransferId: "order-demo-1",
    });
    expect(record.deliveryPlaceId).not.toBe("kizilay");
    expect(record.subtotal).toBeGreaterThanOrEqual(300);
    expect(record.lines.every((line) => line.productId !== "hoodie")).toBe(
      true
    );
    expect(transfers).toEqual([
      {
        id: "order-demo-2",
        kind: "issue",
        from: null,
        to: DEMO_CUSTOMER,
        amount: record.total,
        note: "Demo bot funding",
        context: { type: "order", id: "order-demo", code: record.code },
        holdUntil: null,
        reverses: null,
      },
      expect.objectContaining({
        id: "order-demo-1",
        kind: "order",
        from: DEMO_CUSTOMER,
        amount: record.total,
        holdUntil: record.deliverAt,
      }),
    ]);
  });

  it("picks 1 or 2 available products by the operation id, topped up to the minimum", () => {
    const available = menu.filter((item) => item.available);
    const counts = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const lines = demoLines(`order-${i}`, available, {
        deliveryFee: 150,
        minimumOrder: 300,
      });
      counts.add(lines.length);
      expect(new Set(lines.map((l) => l.productId)).size).toBe(lines.length);
      expect(
        priceOrder(lines, { deliveryFee: 150, minimumOrder: 300 }).belowMinimum
      ).toBe(0);
      expect(demoLines(`order-${i}`, available, business())).toEqual(lines);
    }
    expect([...counts].sort()).toEqual([1, 2]);
    // Only simit: two of them reach 3.00.
    expect(demoLines("order-x", [simit], business())).toEqual([
      { productId: "simit", name: "Simit", unitPrice: 250, quantity: 2 },
    ]);
  });

  it("delivers anywhere but the business's own place", () => {
    for (let i = 0; i < 50; i++) {
      expect(demoPlace(`order-${i}`, "kizilay")).not.toBe("kizilay");
    }
  });

  it("refuses closed businesses and empty menus", () => {
    const input = {
      operationId: "order-demo",
      fingerprint: "h",
      business: "kizilaykahve",
      requestedBy: me,
    };
    expect(() =>
      planDemoOrder(
        input,
        demoContext({ business: business({ acceptingOrders: false }) })
      )
    ).toThrow(UnavailableError);
    expect(() =>
      planDemoOrder(input, demoContext({ products: [menu[3]] }))
    ).toThrow(
      new UnavailableError(
        "Kızılay Kahve has nothing available to order right now"
      )
    );
    expect(() => planDemoOrder(input, demoContext({ business: null }))).toThrow(
      NotFoundError
    );
  });
});

describe("planCancel", () => {
  const record = planOrder(newOrder(), context()).record;
  const orderAtOffset = (offset: number, fields: Partial<OrderRecord> = {}) =>
    toOrder({ ...record, ...fields }, at(offset));

  it("refunds the held payment with its natural id", () => {
    expect(planCancel(orderAtOffset(0), "buyer")).toEqual({
      id: "refund-order-abc-1",
      kind: "order_refund",
      from: {
        username: "kizilaykahve",
        fullname: "Kızılay Kahve",
        image: "/avatars/kizilaykahve.svg",
      },
      to: me,
      amount: 900,
      note: null,
      context: { type: "order", id: "order-abc", code: record.code },
      holdUntil: null,
      reverses: "order-abc-1",
    });
  });

  it("follows each side's window and is a no-op once cancelled", () => {
    expect(() => planCancel(orderAtOffset(MINUTE), "buyer")).toThrow(
      new InvalidStateError(
        "Kızılay Kahve already accepted this order, so it can't be cancelled"
      )
    );
    expect(planCancel(orderAtOffset(MINUTE), "business")).not.toBeNull();
    expect(() => planCancel(orderAtOffset(10 * MINUTE), "business")).toThrow(
      new InvalidStateError("This order was already delivered")
    );
    expect(
      planCancel(orderAtOffset(MINUTE, { cancelledAt: iso(1) }), "business")
    ).toBeNull();
  });
});

describe("order views", () => {
  const record = (id: string, fields: Partial<OrderRecord> = {}) => ({
    ...planOrder(newOrder({ operationId: id }), context()).record,
    ...fields,
  });
  const sarah = { username: "sarahcodes", fullname: "Sarah Chen", image: null };

  it("tells managers about new orders and buyers about deliveries and business cancellations", () => {
    const orders: IOrder[] = [
      record("o-sarah", { buyer: sarah }),
      record("o-mine"),
      record("o-cancelled", {
        cancelledAt: iso(MINUTE),
        cancelledBy: "business",
        refundTransferId: "refund-o-cancelled-1",
      }),
      record("o-self-cancelled", { cancelledAt: iso(1), cancelledBy: "buyer" }),
    ].map((r) => toOrder(r, at(10 * MINUTE)));

    const forManager = orderNotifications("ILLLHANOZKAN", orders, [
      "KizilayKahve",
    ]);
    expect(forManager.map((n) => n.id)).toEqual([
      "order-received-o-sarah",
      "order-received-o-mine",
      "order-received-o-cancelled",
      "order-received-o-self-cancelled",
    ]);
    expect(forManager[0]).toEqual({
      id: "order-received-o-sarah",
      type: "order",
      event: "received",
      createdAt: iso(0),
      actor: sarah,
      orderId: "o-sarah",
      code: orderCode("o-sarah"),
      business: "Kızılay Kahve",
    });

    const forBuyer = orderNotifications("alice_test", orders, []);
    expect(forBuyer.map((n) => [n.id, n.createdAt])).toEqual([
      ["order-delivered-o-mine", iso(10 * MINUTE)],
      ["order-cancelled-o-cancelled", iso(MINUTE)],
    ]);
    // Not delivered yet: nothing to say.
    expect(
      orderNotifications(
        "alice_test",
        [toOrder(record("o-mine"), at(10 * MINUTE - 1))],
        []
      )
    ).toEqual([]);
    // Your own order at a business you run says nothing new.
    expect(
      orderNotifications("alice_test", orders.slice(1, 2), [
        "kizilaykahve",
      ]).map((n) => n.id)
    ).toEqual(["order-delivered-o-mine"]);
  });

  it("shows an order in progress as live activity", () => {
    expect(toLiveActivity(toOrder(record("o-1"), at(5 * MINUTE)))).toEqual({
      kind: "order",
      id: "o-1",
      title: "Order from Kızılay Kahve",
      status: "On the way",
      eta: iso(10 * MINUTE),
      href: "/orders/o-1",
      nextChangeAt: iso(10 * MINUTE),
    });
  });

  it("summarizes orders: cancelled ones don't count, undelivered ones are pending", () => {
    expect(
      summarizeOrders(
        [
          {
            total: 900,
            deliverAt: iso(MINUTE),
            cancelledAt: null,
            sourceTweetId: "t",
          },
          {
            total: 600,
            deliverAt: iso(-MINUTE),
            cancelledAt: null,
            sourceTweetId: null,
          },
          {
            total: 500,
            deliverAt: iso(MINUTE),
            cancelledAt: iso(0),
            sourceTweetId: "t",
          },
        ],
        NOW
      )
    ).toEqual({ orders: 2, revenue: 1_500, pending: 900, fromTweets: 1 });
  });

  it("lists what a buyer received, latest delivery first, each product once", () => {
    const orders = [
      record("o-a", { deliverAt: iso(-2 * MINUTE) }),
      record("o-b", {
        deliverAt: iso(-MINUTE),
        lines: [
          {
            productId: "simit",
            name: "Simit",
            unitPrice: 250,
            quantity: 2,
            total: 500,
          },
        ],
      }),
      record("o-c", { deliverAt: iso(MINUTE) }),
      record("o-d", {
        deliverAt: iso(-3 * MINUTE),
        cancelledAt: iso(-4 * MINUTE),
      }),
      record("o-e", { deliverAt: iso(-MINUTE), buyer: sarah }),
    ];
    expect(purchasedProductIds(orders, "ALICE_TEST", NOW)).toEqual([
      "simit",
      "latte",
    ]);
    expect(purchasedProductIds(orders, "nobody", NOW)).toEqual([]);
  });
});
