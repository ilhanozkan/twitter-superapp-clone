import { beforeEach, describe, expect, it } from "vitest";

import {
  expectLedgerInvariants,
  expectStoresAgree,
  SLOW,
  Subject,
  SUBJECT_NOW,
  subjects,
} from "../../test/repositorySubjects";
import { IOrder } from "../../types/Order";
import { PlaceId } from "../../types/Superapp";
import { IAuthor } from "../../types/User";
import { fingerprint, operationId } from "../superapp/idempotency";
import { ORDER_CODE_PATTERN } from "../superapp/orders";
import {
  ConflictError,
  IdempotencyKeyReusedError,
  InsufficientFundsError,
  InvalidStateError,
  LimitExceededError,
  NotFoundError,
  PriceChangedError,
  UnavailableError,
  WalletFrozenError,
} from "./errors";
import { createMemoryRepository, createMemoryState } from "./memory";
import { NewOrder } from "./orders/types";
import { PRIVATE_TYPES } from "./sanity/ids";
import { createSanityRepository } from "./sanity/repository";
import { seedToSanityDocuments } from "./sanity/seed";
import { createSeedData, DEMO_USERNAME } from "./seed";
import { Repository } from "./types";
import { FakeSanityClient } from "../../test/fakeSanityClient";

// Orders on both stores: placing (with every reason it can be refused),
// the held payment, progress over time, cancelling and refunds, the demo
// bot, notifications, live activity, summaries and the C2 seed. Subjects
// start at 2026-10-08T12:00Z, 15:00 in Istanbul, when every seeded business
// is open. Fresh buyers (alice_test, ...) keep the assertions independent
// of what other lanes add to the world.

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const DAY = 24 * 60 * MINUTE;

const author = (username: string, fullname = username): IAuthor => ({
  username,
  fullname,
  image: null,
});
const alice = author("alice_test", "Alice Test");
const bob = author("bob_test", "Bob Test");
const carol = author("carol_test", "Carol Test");
const me: IAuthor = {
  username: DEMO_USERNAME,
  fullname: "Ilhan Ozkan",
  image: "/avatars/illlhanozkan.svg",
};
const kizilay = {
  username: "kizilaykahve",
  fullname: "Kızılay Kahve",
  image: "/avatars/kizilaykahve.svg",
};

const LATTE = "seed-p-kk-latte";
const SIMIT = "seed-p-kk-simit";
const MUG = "seed-p-sa-mug";
const STICKERS = "seed-p-sa-stickers";

let keys = 0;
const nextKey = () => `order-key-${++keys}`;

/** An order as POST /api/orders would build it from its body. */
function orderInput(
  buyer: IAuthor,
  {
    business = "kizilaykahve",
    items = [[LATTE, 1]],
    expectedTotal = 650,
    deliveryPlaceId = "tunali",
    note = null,
    sourceTweetId = null,
    key = nextKey(),
  }: {
    business?: string;
    items?: [string, number][];
    expectedTotal?: number;
    deliveryPlaceId?: PlaceId;
    note?: string | null;
    sourceTweetId?: string | null;
    key?: string;
  } = {}
): NewOrder {
  const lines = items.map(([productId, quantity]) => ({ productId, quantity }));
  const body = {
    business: business.toLowerCase(),
    items: lines,
    deliveryPlaceId,
    note,
    expectedTotal,
    sourceTweetId,
  };
  return {
    operationId: operationId("order", buyer.username, "orders.place", key),
    fingerprint: fingerprint(body),
    buyer,
    business,
    lines,
    deliveryPlaceId,
    note,
    expectedTotal,
    sourceTweetId,
  };
}

const demoInput = (business: string, key = nextKey()) => ({
  operationId: operationId("order", me.username, "orders.demo", key),
  fingerprint: fingerprint({ business: business.toLowerCase() }),
  business,
  requestedBy: me,
});

const later = (subject: Subject, ms: number) =>
  new Date(subject.clock.now().getTime() + ms).toISOString();

/** Expects `promise` to reject with an error of `type` and returns it. */
async function rejection<T extends Error>(
  promise: Promise<unknown>,
  type: new (...args: never[]) => T
): Promise<T> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason
  );
  expect(error).toBeInstanceOf(type);
  return error as T;
}

describe.each(subjects())("%s orders", SLOW, (name, create) => {
  let subject: Subject;
  let repo: Repository;
  const wallet = (username: string) => repo.wallet.getWallet(username);
  const fund = (user: IAuthor, amount: 2_500 | 5_000 | 10_000 = 2_500) =>
    repo.wallet.topUp({
      operationId: operationId("tx", user.username, "wallet.topUp", nextKey()),
      fingerprint: fingerprint({ amount }),
      to: user,
      amount,
    });
  const transactions = () => subject.client?.mutationLog.length ?? 0;
  const ordersOf = async (buyer: string, state?: "active" | "past") =>
    (await repo.orders.listOrders({ buyer, state, limit: 50 })).items;

  beforeEach(() => {
    subject = create();
    repo = subject.repo;
  });

  it("is on, with no orders of its own for new accounts", async () => {
    expect(repo.featureStatus("orders")).toBe("on");
    expect(repo.orders.implemented).toBe(true);
    expect(await ordersOf("alice_test")).toEqual([]);
    expect(await repo.orders.liveActivity("alice_test")).toEqual([]);
    expect(await repo.orders.notifications("alice_test", 20)).toEqual([]);
    expect(await repo.orders.getOrder("nope")).toBeNull();
    expect(await repo.orders.getOrder("private.seed-o01")).toBeNull();
  });

  describe("C2 seed", () => {
    it("serves the three seeded orders with their codes and held payments", async () => {
      const o01 = (await repo.orders.getOrder("seed-o01"))!;
      expect(o01).toMatchObject({
        id: "seed-o01",
        code: "K7Q2",
        buyer: me,
        placedBy: "buyer",
        business: { ...kizilay, category: "cafe" },
        lines: [
          {
            productId: LATTE,
            name: "Pistachio latte",
            unitPrice: 500,
            quantity: 1,
            total: 500,
          },
          {
            productId: SIMIT,
            name: "Simit",
            unitPrice: 250,
            quantity: 1,
            total: 250,
          },
        ],
        subtotal: 750,
        deliveryFee: 150,
        total: 900,
        deliveryPlace: { id: "tunali", name: "Tunalı Hilmi" },
        status: "delivered",
        eta: null,
        nextChangeAt: null,
        paymentTransferId: "seed-tx-o01",
        canCancel: { buyer: false, business: false },
      });
      expect(await repo.wallet.getTransfer("seed-tx-o01")).toMatchObject({
        kind: "order",
        amount: 900,
        from: me,
        to: kizilay,
        context: { type: "order", id: "seed-o01", code: "K7Q2" },
        holdUntil: o01.deliverAt,
        reversedBy: null,
      });

      const o02 = (await repo.orders.getOrder("seed-o02"))!;
      expect(o02).toMatchObject({
        buyer: { username: "sarahcodes" },
        business: { username: "superapp", category: "shop" },
        total: 600,
        status: "delivered",
      });

      // Placed 40 minutes ago at scale 1: accepted, on the way at 61 min,
      // delivered at 181 min (141 minutes from now).
      const o03 = (await repo.orders.getOrder("seed-o03"))!;
      expect(o03).toMatchObject({
        code: "M2X9",
        buyer: { username: "devmarco", fullname: "Marco Rossi" },
        total: 1_500,
        status: "accepted",
        placedAt: later(subject, -40 * MINUTE),
        deliverAt: later(subject, 141 * MINUTE),
        eta: later(subject, 141 * MINUTE),
        nextChangeAt: later(subject, 21 * MINUTE),
        canCancel: { buyer: false, business: true },
      });
      // Its payment is still held for @superapp.
      expect(await repo.wallet.getTransfer("seed-tx-o03")).toMatchObject({
        holdUntil: o03.deliverAt,
        reversedBy: null,
      });
      expect((await wallet("superapp")).pending).toBeGreaterThanOrEqual(1_500);
      await expectLedgerInvariants(subject);
    });

    it("tells @superapp's manager about its orders and the demo user about seed-o01", async () => {
      const ids = (await repo.orders.notifications(DEMO_USERNAME, 20)).map(
        (notification) => notification.id
      );
      expect(ids).toEqual(
        expect.arrayContaining([
          "order-received-seed-o03",
          "order-received-seed-o02",
          "order-delivered-seed-o01",
        ])
      );
      expect(await repo.orders.liveActivity("devmarco")).toEqual([
        {
          kind: "order",
          id: "seed-o03",
          title: "Order from Twitter SuperApp",
          status: "Accepted",
          eta: later(subject, 141 * MINUTE),
          href: "/orders/seed-o03",
          nextChangeAt: later(subject, 21 * MINUTE),
        },
      ]);
    });
  });

  describe("placing an order", () => {
    it("pays the business in one commit, held until delivery", async () => {
      await fund(alice);
      const before = await wallet("kizilaykahve");
      const commits = transactions();

      const {
        order,
        wallet: after,
        replayed,
      } = await repo.orders.placeOrder(
        orderInput(alice, {
          items: [
            [LATTE, 1],
            [SIMIT, 2],
          ],
          expectedTotal: 1_150,
          note: "Oat milk please",
          sourceTweetId: "seed-t22",
        })
      );

      if (subject.client) expect(transactions()).toBe(commits + 1);
      expect(replayed).toBe(false);
      expect(order).toMatchObject({
        buyer: alice,
        placedBy: "buyer",
        business: { ...kizilay, category: "cafe" },
        subtotal: 1_000,
        deliveryFee: 150,
        total: 1_150,
        note: "Oat milk please",
        sourceTweetId: "seed-t22",
        deliveryPlace: { id: "tunali" },
        placedAt: later(subject, 0),
        acceptAt: later(subject, MINUTE),
        onTheWayAt: later(subject, 4 * MINUTE),
        deliverAt: later(subject, 10 * MINUTE),
        status: "placed",
        cancelledAt: null,
        cancelledBy: null,
        refundTransferId: null,
        paymentTransferId: `${order.id}-1`,
        canCancel: { buyer: true, business: true },
      });
      expect(order.id).toMatch(/^order-[0-9a-f]{32}$/);
      expect(order.code).toMatch(ORDER_CODE_PATTERN);
      expect(after).toEqual({
        username: "alice_test",
        balance: 1_350,
        pending: 0,
        available: 1_350,
        frozen: false,
      });

      // The business has the credits at once, but can't spend them yet.
      const business = await wallet("kizilaykahve");
      expect(business.balance).toBe(before.balance + 1_150);
      expect(business.pending).toBe(before.pending + 1_150);
      expect(business.available).toBe(before.available);
      expect(
        await repo.wallet.getTransfer(order.paymentTransferId)
      ).toMatchObject({
        kind: "order",
        amount: 1_150,
        from: alice,
        to: kizilay,
        context: { type: "order", id: order.id, code: order.code },
        holdUntil: order.deliverAt,
      });
      expect(await repo.orders.getOrder(order.id)).toEqual(order);
      await expectLedgerInvariants(subject);
    });

    it("replays the same key once and refuses it with a different body", async () => {
      await fund(alice);
      const input = orderInput(alice, { key: "same-key-123" });
      const first = await repo.orders.placeOrder(input);
      const again = await repo.orders.placeOrder(input);

      expect(again).toEqual({ ...first, replayed: true });
      expect(await ordersOf("alice_test")).toHaveLength(1);
      expect((await wallet("alice_test")).balance).toBe(2_500 - 650);

      await rejection(
        repo.orders.placeOrder(
          orderInput(alice, { key: "same-key-123", note: "Changed my mind" })
        ),
        IdempotencyKeyReusedError
      );
      // Another buyer's key never collides.
      await fund(bob);
      const bobs = await repo.orders.placeOrder(
        orderInput(bob, { key: "same-key-123" })
      );
      expect(bobs.order.id).not.toBe(first.order.id);
      await expectLedgerInvariants(subject);
    });

    it("refuses an out-of-date total, writing nothing", async () => {
      await fund(alice);
      const commits = transactions();
      const error = await rejection(
        repo.orders.placeOrder(orderInput(alice, { expectedTotal: 600 })),
        PriceChangedError
      );
      expect(error).toMatchObject({ expected: 600, actual: 650 });
      expect(transactions()).toBe(commits);
      expect(await ordersOf("alice_test")).toEqual([]);
      expect((await wallet("alice_test")).balance).toBe(2_500);
    });

    it("says why the business can't take it: closed, paused or frozen", async () => {
      await fund(alice);
      const lahmacun = () =>
        repo.orders.placeOrder(
          orderInput(alice, {
            business: "lahmacunlab",
            items: [["seed-p-ll-lahmacun", 2]],
            expectedTotal: 1_000,
          })
        );

      // 08:00 in Istanbul: Lahmacun Lab opens at 11:00.
      subject.clock.set("2026-10-08T05:00:00.000Z");
      expect((await rejection(lahmacun(), UnavailableError)).message).toBe(
        "Lahmacun Lab is closed · Opens 11:00"
      );
      subject.clock.set(SUBJECT_NOW.toISOString());
      expect((await lahmacun()).order.total).toBe(1_000);

      await repo.business.setAcceptingOrders("kizilaykahve", false);
      expect(
        (
          await rejection(
            repo.orders.placeOrder(orderInput(alice)),
            UnavailableError
          )
        ).message
      ).toBe("Kızılay Kahve isn't taking orders right now");
      await repo.business.setAcceptingOrders("kizilaykahve", true);

      subject.freeze("kizilaykahve", true);
      expect(
        (
          await rejection(
            repo.orders.placeOrder(orderInput(alice)),
            UnavailableError
          )
        ).message
      ).toBe("Kızılay Kahve can't take orders right now");
      subject.freeze("kizilaykahve", false);

      expect(
        (await repo.orders.placeOrder(orderInput(alice))).order.total
      ).toBe(650);
      await expectLedgerInvariants(subject);
    });

    it("names sold-out and unknown products, and enforces the minimum", async () => {
      await fund(alice);
      await repo.shop.setProductAvailability(SIMIT, false);

      const soldOut = await rejection(
        repo.orders.placeOrder(
          orderInput(alice, {
            items: [
              [LATTE, 1],
              [SIMIT, 1],
            ],
            expectedTotal: 900,
          })
        ),
        UnavailableError
      );
      expect(soldOut.message).toBe("Simit is sold out");
      expect(soldOut.productIds).toEqual([SIMIT]);

      // Another business's product, and one that doesn't exist.
      const mixed = await rejection(
        repo.orders.placeOrder(
          orderInput(alice, {
            items: [
              [MUG, 1],
              [LATTE, 1],
              ["no-such-product", 1],
            ],
          })
        ),
        UnavailableError
      );
      expect(mixed.productIds).toEqual([MUG, "no-such-product"]);

      await repo.shop.setProductAvailability(SIMIT, true);
      // Simit alone is 2.50 of food; Kızılay Kahve's minimum is 3.00.
      const minimum = await rejection(
        repo.orders.placeOrder(
          orderInput(alice, { items: [[SIMIT, 1]], expectedTotal: 400 })
        ),
        UnavailableError
      );
      expect(minimum.message).toBe(
        "The minimum order at Kızılay Kahve is 3.00 credits"
      );
      expect(minimum.productIds).toEqual([]);
      expect(await ordersOf("alice_test")).toEqual([]);
      expect((await wallet("alice_test")).balance).toBe(2_500);
    });

    it("refuses orders over 200.00, your own business, and unknown businesses", async () => {
      await rejection(
        repo.orders.placeOrder(
          orderInput(alice, {
            business: "superapp",
            items: [[MUG, 17]],
            expectedTotal: 20_700,
          })
        ),
        LimitExceededError
      );
      const own = await rejection(
        repo.orders.placeOrder(orderInput(author("KizilayKahve"))),
        InvalidStateError
      );
      expect(own.message).toBe("You can't order from your own business");
      await rejection(
        repo.orders.placeOrder(orderInput(alice, { business: "sarahcodes" })),
        NotFoundError
      );
      await rejection(
        repo.orders.placeOrder(orderInput(alice, { business: "nobody_here" })),
        NotFoundError
      );
    });

    it("lets a manager order from the business they run", async () => {
      const { order } = await repo.orders.placeOrder(
        orderInput(me, {
          business: "superapp",
          items: [[STICKERS, 1]],
          expectedTotal: 600,
        })
      );
      expect(order.business.username).toBe("superapp");
    });

    it("checks the buyer's available credits and freeze in the same commit", async () => {
      const insufficient = await rejection(
        repo.orders.placeOrder(orderInput(alice)),
        InsufficientFundsError
      );
      expect(insufficient).toMatchObject({ available: 0, required: 650 });

      await fund(alice);
      subject.freeze("alice_test", true);
      await rejection(
        repo.orders.placeOrder(orderInput(alice)),
        WalletFrozenError
      );
      subject.freeze("alice_test", false);
      expect(await ordersOf("alice_test")).toEqual([]);
      await expectLedgerInvariants(subject);
    });

    it("allows 5 orders in progress, exactly, even when they race", async () => {
      await fund(alice, 5_000);
      if (subject.client) {
        // Every operation reads its snapshot before any of them commits.
        subject.client.fetchDelay = () =>
          new Promise((resolve) => setImmediate(resolve));
      }
      const outcomes = await Promise.allSettled(
        Array.from({ length: 7 }, () =>
          repo.orders.placeOrder(orderInput(alice))
        )
      );
      if (subject.client) subject.client.fetchDelay = undefined;

      const placed = outcomes.filter((o) => o.status === "fulfilled").length;
      for (const outcome of outcomes) {
        if (outcome.status === "rejected") {
          expect(
            outcome.reason instanceof LimitExceededError ||
              outcome.reason instanceof ConflictError,
            String(outcome.reason)
          ).toBe(true);
        }
      }
      expect(await ordersOf("alice_test", "active")).toHaveLength(placed);
      if (name === "memory") expect(placed).toBe(5);
      else expect(placed).toBeGreaterThanOrEqual(1);
      expect(placed).toBeLessThanOrEqual(5);

      while ((await ordersOf("alice_test", "active")).length < 5) {
        await repo.orders.placeOrder(orderInput(alice));
      }
      const sixth = await rejection(
        repo.orders.placeOrder(orderInput(alice)),
        LimitExceededError
      );
      expect(sixth.message).toBe("You can have 5 orders in progress at a time");

      // A cancelled order, or a delivered one, frees its place.
      const [newest] = await ordersOf("alice_test", "active");
      await repo.orders.cancelOrder({ id: newest.id, as: "buyer" });
      await repo.orders.placeOrder(orderInput(alice));
      subject.clock.advance(10 * MINUTE);
      expect(await ordersOf("alice_test", "active")).toEqual([]);
      await repo.orders.placeOrder(orderInput(alice));
      // Every order kept was paid once; the cancelled one was refunded.
      const all = await ordersOf("alice_test");
      const kept = all.filter((order) => !order.cancelledAt).length;
      expect(all.length - kept).toBe(1);
      expect((await wallet("alice_test")).balance).toBe(5_000 - 650 * kept);
      await expectLedgerInvariants(subject);
    });

    it("places one order, not three, when they race for the 5th place", async () => {
      // On Sanity the race from none above stops short of the limit (each
      // round of retries places one), so this one starts at the limit's edge.
      await fund(alice, 5_000);
      for (let placed = 0; placed < 4; placed++) {
        await repo.orders.placeOrder(orderInput(alice));
      }
      if (subject.client) {
        subject.client.fetchDelay = () =>
          new Promise((resolve) => setImmediate(resolve));
      }
      const outcomes = await Promise.allSettled(
        Array.from({ length: 3 }, () =>
          repo.orders.placeOrder(orderInput(alice))
        )
      );
      if (subject.client) subject.client.fetchDelay = undefined;

      for (const outcome of outcomes) {
        if (outcome.status === "rejected") {
          expect(
            outcome.reason instanceof LimitExceededError ||
              outcome.reason instanceof ConflictError,
            String(outcome.reason)
          ).toBe(true);
        }
      }
      expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
      expect(await ordersOf("alice_test", "active")).toHaveLength(5);
      expect((await wallet("alice_test")).balance).toBe(5_000 - 650 * 5);
      await expectLedgerInvariants(subject);
    });
  });

  describe("progress", () => {
    it("moves through its stages with the clock, then releases the payment", async () => {
      await fund(alice);
      const { order } = await repo.orders.placeOrder(orderInput(alice));
      const read = async () => (await repo.orders.getOrder(order.id))!;
      const kizilayBefore = await wallet("kizilaykahve");

      subject.clock.advance(MINUTE - 1);
      expect((await read()).status).toBe("placed");
      subject.clock.advance(1);
      expect(await read()).toMatchObject({
        status: "accepted",
        canCancel: { buyer: false, business: true },
        nextChangeAt: order.onTheWayAt,
      });
      subject.clock.advance(3 * MINUTE);
      expect((await read()).status).toBe("on_the_way");
      expect(await ordersOf("alice_test", "active")).toHaveLength(1);
      expect(await ordersOf("alice_test", "past")).toEqual([]);

      subject.clock.advance(6 * MINUTE);
      const delivered = await read();
      expect(delivered).toMatchObject({
        status: "delivered",
        eta: null,
        nextChangeAt: null,
        canCancel: { buyer: false, business: false },
      });
      expect(delivered.stages.every((stage) => stage.reached)).toBe(true);
      expect(await ordersOf("alice_test", "active")).toEqual([]);
      expect(await ordersOf("alice_test", "past")).toHaveLength(1);

      // Delivered: the business can spend the credits now.
      const kizilayAfter = await wallet("kizilaykahve");
      expect(kizilayAfter.balance).toBe(kizilayBefore.balance);
      expect(kizilayAfter.pending).toBe(kizilayBefore.pending - 650);
      expect(kizilayAfter.available).toBe(kizilayBefore.available + 650);
      await expectLedgerInvariants(subject);
    });

    it("uses the time scale given at creation, with the buyer's 15 s floor", async () => {
      const [, createFast] = subjects({ timeScale: 60 }).find(
        ([candidate]) => candidate === name
      )!;
      const fast = createFast();
      await fast.repo.wallet.topUp({
        operationId: operationId("tx", "alice_test", "wallet.topUp", "fast-1"),
        fingerprint: fingerprint({ amount: 2_500 }),
        to: alice,
        amount: 2_500,
      });
      const { order } = await fast.repo.orders.placeOrder(orderInput(alice));
      const start = fast.clock.now().getTime();
      const offset = (iso: string) => Date.parse(iso) - start;
      expect(offset(order.acceptAt)).toBe(15 * SECOND);
      expect(offset(order.onTheWayAt)).toBe(18 * SECOND);
      expect(offset(order.deliverAt)).toBe(24 * SECOND);
      // The seeded orders keep the schedule they were created with.
      expect(
        Date.parse((await fast.repo.orders.getOrder("seed-o03"))!.deliverAt) -
          start
      ).toBe(141 * MINUTE);
    });
  });

  describe("cancelling", () => {
    it("lets the buyer cancel before acceptance, refunding once", async () => {
      await fund(alice);
      const { order } = await repo.orders.placeOrder(orderInput(alice));
      const kizilayBefore = await wallet("kizilaykahve");
      subject.clock.advance(30 * SECOND);

      const commits = transactions();
      const first = await repo.orders.cancelOrder({
        id: order.id,
        as: "buyer",
      });
      if (subject.client) expect(transactions()).toBe(commits + 1);
      expect(first.changed).toBe(true);
      expect(first.order).toMatchObject({
        status: "cancelled",
        cancelledAt: later(subject, 0),
        cancelledBy: "buyer",
        refundTransferId: `refund-${order.paymentTransferId}`,
        eta: null,
        nextChangeAt: null,
        canCancel: { buyer: false, business: false },
      });
      expect(first.order.stages.map((stage) => stage.status)).toEqual([
        "placed",
        "cancelled",
      ]);
      expect((await wallet("alice_test")).balance).toBe(2_500);
      expect(await wallet("kizilaykahve")).toEqual({
        ...kizilayBefore,
        balance: kizilayBefore.balance - 650,
        pending: kizilayBefore.pending - 650,
      });
      expect(
        await repo.wallet.getTransfer(first.order.refundTransferId!)
      ).toMatchObject({
        kind: "order_refund",
        amount: 650,
        from: kizilay,
        to: alice,
        reverses: order.paymentTransferId,
        context: { type: "order", id: order.id, code: order.code },
      });
      expect(
        (await repo.wallet.getTransfer(order.paymentTransferId))!.reversedBy
      ).toBe(first.order.refundTransferId);

      // Cancelling again, by either side, changes nothing.
      const again = await repo.orders.cancelOrder({
        id: order.id,
        as: "buyer",
      });
      expect(again).toEqual({ order: first.order, changed: false });
      expect(
        (await repo.orders.cancelOrder({ id: order.id, as: "business" }))
          .changed
      ).toBe(false);
      expect((await wallet("alice_test")).balance).toBe(2_500);
      await expectLedgerInvariants(subject);
    });

    it("lets the business refund until delivery, even after spending what it could", async () => {
      await fund(alice);
      const { order } = await repo.orders.placeOrder(orderInput(alice));
      // Kızılay Kahve pays out every credit it may spend.
      const { available } = await wallet("kizilaykahve");
      await repo.wallet.send({
        operationId: operationId(
          "tx",
          "kizilaykahve",
          "wallet.send",
          nextKey()
        ),
        fingerprint: "spend",
        kind: "payment",
        from: kizilay,
        to: carol,
        amount: available,
        note: null,
        context: null,
      });
      expect((await wallet("kizilaykahve")).available).toBe(0);

      subject.clock.advance(5 * MINUTE);
      const { order: cancelled, changed } = await repo.orders.cancelOrder({
        id: order.id,
        as: "business",
      });
      expect(changed).toBe(true);
      expect(cancelled.cancelledBy).toBe("business");
      expect((await wallet("alice_test")).balance).toBe(2_500);
      expect((await wallet("kizilaykahve")).available).toBe(0);
      await expectLedgerInvariants(subject);
    });

    it("refuses each side outside its window, writing nothing", async () => {
      await fund(alice);
      const { order } = await repo.orders.placeOrder(orderInput(alice));

      subject.clock.advance(MINUTE);
      const late = await rejection(
        repo.orders.cancelOrder({ id: order.id, as: "buyer" }),
        InvalidStateError
      );
      expect(late.message).toBe(
        "Kızılay Kahve already accepted this order, so it can't be cancelled"
      );
      subject.clock.advance(9 * MINUTE);
      await rejection(
        repo.orders.cancelOrder({ id: order.id, as: "business" }),
        InvalidStateError
      );
      expect((await repo.orders.getOrder(order.id))!.status).toBe("delivered");
      expect((await wallet("alice_test")).balance).toBe(1_850);
      await rejection(
        repo.orders.cancelOrder({ id: "no-such-order", as: "buyer" }),
        NotFoundError
      );
      await expectLedgerInvariants(subject);
    });

    it("refunds frozen wallets in both directions", async () => {
      await fund(alice);
      const { order } = await repo.orders.placeOrder(orderInput(alice));
      subject.freeze("alice_test", true);
      subject.freeze("kizilaykahve", true);

      const { changed } = await repo.orders.cancelOrder({
        id: order.id,
        as: "business",
      });
      expect(changed).toBe(true);
      expect(await wallet("alice_test")).toMatchObject({
        balance: 2_500,
        frozen: true,
      });
      await expectLedgerInvariants(subject);
    });

    it("refunds once when both sides cancel at the same time", async () => {
      await fund(alice);
      const { order } = await repo.orders.placeOrder(orderInput(alice));
      if (subject.client) {
        subject.client.fetchDelay = () =>
          new Promise((resolve) => setImmediate(resolve));
      }
      const results = await Promise.all([
        repo.orders.cancelOrder({ id: order.id, as: "buyer" }),
        repo.orders.cancelOrder({ id: order.id, as: "business" }),
      ]);
      if (subject.client) subject.client.fetchDelay = undefined;

      expect(results.filter((result) => result.changed)).toHaveLength(1);
      expect(results[0].order.cancelledAt).toBe(results[1].order.cancelledAt);
      expect((await wallet("alice_test")).balance).toBe(2_500);
      const { items } = await repo.wallet.listActivity("alice_test");
      expect(items.filter((t) => t.kind === "order_refund")).toHaveLength(1);
      await expectLedgerInvariants(subject);
    });
  });

  describe("demo orders", () => {
    it("issue the total to demo_customer, who pays it, in one commit", async () => {
      const before = await wallet("superapp");
      const customerBefore = await wallet("demo_customer");
      const commits = transactions();

      const { order, replayed } = await repo.orders.placeDemoOrder(
        demoInput("SuperApp")
      );
      if (subject.client) expect(transactions()).toBe(commits + 1);
      expect(replayed).toBe(false);
      expect(order).toMatchObject({
        placedBy: "demo_bot",
        buyer: {
          username: "demo_customer",
          fullname: "Demo Customer (bot)",
        },
        business: { username: "superapp", category: "shop" },
        sourceTweetId: null,
        status: "placed",
      });
      expect(order.deliveryPlace.id).not.toBe("kizilay");
      expect(order.lines.length).toBeGreaterThanOrEqual(1);
      expect(order.lines.length).toBeLessThanOrEqual(2);
      expect(order.lines.map((line) => line.productId)).not.toContain(
        "seed-p-sa-hoodie"
      );

      const funding = await repo.wallet.getTransfer(`${order.id}-2`);
      expect(funding).toMatchObject({
        kind: "issue",
        from: null,
        to: { username: "demo_customer" },
        amount: order.total,
        note: "Demo bot funding",
        context: { type: "order", id: order.id, code: order.code },
      });
      expect(
        await repo.wallet.getTransfer(order.paymentTransferId)
      ).toMatchObject({
        kind: "order",
        from: { username: "demo_customer" },
        to: { username: "superapp" },
        amount: order.total,
        holdUntil: order.deliverAt,
      });
      expect(await wallet("demo_customer")).toEqual(customerBefore);
      expect((await wallet("superapp")).pending).toBe(
        before.pending + order.total
      );

      // A replay finds the same order; the business hears about it.
      const input = demoInput("superapp", "demo-key-1");
      const first = await repo.orders.placeDemoOrder(input);
      expect(await repo.orders.placeDemoOrder(input)).toEqual({
        ...first,
        replayed: true,
      });
      const notifications = await repo.orders.notifications("superapp", 50);
      expect(notifications.map((n) => n.id)).toContain(
        `order-received-${order.id}`
      );
      await expectLedgerInvariants(subject);
    });

    it("can be cancelled and refunded by the business", async () => {
      const { order } = await repo.orders.placeDemoOrder(demoInput("superapp"));
      const { changed } = await repo.orders.cancelOrder({
        id: order.id,
        as: "business",
      });
      expect(changed).toBe(true);
      expect((await wallet("demo_customer")).available).toBeGreaterThanOrEqual(
        order.total
      );
      await expectLedgerInvariants(subject);
    });

    it("say why a business can't take one", async () => {
      await repo.business.setAcceptingOrders("superapp", false);
      await rejection(
        repo.orders.placeDemoOrder(demoInput("superapp")),
        UnavailableError
      );
      await repo.business.setAcceptingOrders("superapp", true);
      for (const id of [STICKERS, MUG]) {
        await repo.shop.setProductAvailability(id, false);
      }
      expect(
        (
          await rejection(
            repo.orders.placeDemoOrder(demoInput("superapp")),
            UnavailableError
          )
        ).message
      ).toBe("Twitter SuperApp has nothing available to order right now");
      await rejection(
        repo.orders.placeDemoOrder(demoInput("sarahcodes")),
        NotFoundError
      );
    });
  });

  describe("reads", () => {
    it("pages orders newest first, by buyer, business and state", async () => {
      await fund(alice, 5_000);
      await fund(bob);
      const placed: IOrder[] = [];
      for (let i = 0; i < 4; i++) {
        placed.push((await repo.orders.placeOrder(orderInput(alice))).order);
        subject.clock.advance(SECOND);
      }
      placed.push(
        (
          await repo.orders.placeOrder(
            orderInput(alice, {
              business: "superapp",
              items: [[STICKERS, 1]],
              expectedTotal: 600,
            })
          )
        ).order
      );
      await repo.orders.placeOrder(orderInput(bob));

      const first = await repo.orders.listOrders({
        buyer: "ALICE_TEST",
        limit: 2,
      });
      const second = await repo.orders.listOrders({
        buyer: "alice_test",
        limit: 2,
        cursor: first.nextCursor,
      });
      const third = await repo.orders.listOrders({
        buyer: "alice_test",
        limit: 2,
        cursor: second.nextCursor,
      });
      expect(third.nextCursor).toBeNull();
      expect(
        [...first.items, ...second.items, ...third.items].map((o) => o.id)
      ).toEqual(placed.map((o) => o.id).reverse());

      const atKizilay = await repo.orders.listOrders({
        business: "kizilaykahve",
        state: "active",
      });
      expect(atKizilay.items.map((o) => o.buyer.username)).toEqual([
        "bob_test",
        "alice_test",
        "alice_test",
        "alice_test",
        "alice_test",
      ]);
      expect(
        (
          await repo.orders.listOrders({
            buyer: "alice_test",
            business: "superapp",
          })
        ).items.map((o) => o.id)
      ).toEqual([placed[4].id]);
      expect(
        (
          await repo.orders.listOrders({ business: "superapp", state: "past" })
        ).items.map((o) => o.id)
      ).toEqual(["seed-o02"]);
    });

    it("summarizes a business's orders since a time", async () => {
      await fund(alice);
      const since = later(subject, 0);
      const { order } = await repo.orders.placeOrder(
        orderInput(alice, { sourceTweetId: "seed-t22" })
      );
      await repo.orders.placeOrder(
        orderInput(alice, { items: [[LATTE, 2]], expectedTotal: 1_150 })
      );
      const cancelled = await repo.orders.placeOrder(orderInput(alice));
      await repo.orders.cancelOrder({ id: cancelled.order.id, as: "buyer" });

      expect(await repo.orders.businessSummary("KizilayKahve", since)).toEqual({
        orders: 2,
        revenue: 1_800,
        pending: 1_800,
        fromTweets: 1,
      });
      subject.clock.advance(10 * MINUTE);
      expect(
        await repo.orders.businessSummary("kizilaykahve", since)
      ).toMatchObject({ orders: 2, revenue: 1_800, pending: 0 });
      expect(
        await repo.orders.businessSummary("kizilaykahve", later(subject, 0))
      ).toEqual({ orders: 0, revenue: 0, pending: 0, fromTweets: 0 });
      // seed-o01 was placed yesterday.
      expect(
        (
          await repo.orders.businessSummary(
            "kizilaykahve",
            new Date(SUBJECT_NOW.getTime() - 2 * DAY).toISOString()
          )
        ).orders
      ).toBe(3);
      expect(order.sourceTweetId).toBe("seed-t22");
    });

    it("tells the buyer about delivery only once it is due", async () => {
      await fund(alice);
      const { order } = await repo.orders.placeOrder(orderInput(alice));
      const ids = async (username: string) =>
        (await repo.listNotifications(username, 50)).map((n) => n.id);

      expect(await ids("alice_test")).toEqual([]);
      expect(await ids("kizilaykahve")).toContain(`order-received-${order.id}`);
      expect(
        (await repo.orders.liveActivity("alice_test")).map((a) => a.status)
      ).toEqual(["Placed"]);

      subject.clock.advance(10 * MINUTE - 1);
      expect(await ids("alice_test")).toEqual([]);
      expect(
        (await repo.orders.liveActivity("alice_test")).map((a) => a.status)
      ).toEqual(["On the way"]);

      subject.clock.advance(1);
      const [delivered] = await repo.orders.notifications("alice_test", 10);
      expect(delivered).toEqual({
        id: `order-delivered-${order.id}`,
        type: "order",
        event: "delivered",
        createdAt: order.deliverAt,
        actor: kizilay,
        orderId: order.id,
        code: order.code,
        business: "Kızılay Kahve",
      });
      expect(await ids("alice_test")).toEqual([delivered.id]);
      expect(await repo.orders.liveActivity("alice_test")).toEqual([]);
    });

    it("tells the buyer when the business cancels, not when they do", async () => {
      await fund(alice);
      const mine = await repo.orders.placeOrder(orderInput(alice));
      const theirs = await repo.orders.placeOrder(orderInput(alice));
      subject.clock.advance(SECOND);
      await repo.orders.cancelOrder({ id: mine.order.id, as: "buyer" });
      await repo.orders.cancelOrder({ id: theirs.order.id, as: "business" });

      expect(
        (await repo.orders.notifications("alice_test", 10)).map((n) => [
          n.id,
          n.createdAt,
        ])
      ).toEqual([[`order-cancelled-${theirs.order.id}`, later(subject, 0)]]);
    });

    it("suggests products you bought in the composer once delivered", async () => {
      await fund(alice);
      await repo.orders.placeOrder(
        orderInput(alice, { items: [[SIMIT, 2]], expectedTotal: 650 })
      );
      const suggested = async () =>
        (await repo.shop.listAttachableProducts("alice_test")).map((p) => p.id);
      expect(await suggested()).toEqual([]);
      subject.clock.advance(10 * MINUTE);
      expect(await suggested()).toEqual([SIMIT]);
      await repo.shop.setProductAvailability(SIMIT, false);
      expect(await suggested()).toEqual([]);
    });
  });

  it("isn't suggested while orders are off", async () => {
    const [, createOff] = subjects({ disabled: ["orders"] }).find(
      ([candidate]) => candidate === name
    )!;
    const off = createOff().repo;
    expect(off.featureStatus("orders")).toBe("off");
    expect(
      (await off.shop.listAttachableProducts(DEMO_USERNAME)).map((p) => p.id)
    ).toEqual([STICKERS, MUG]);
    expect(
      (await off.listNotifications(DEMO_USERNAME, 50)).some(
        (n) => n.type === "order"
      )
    ).toBe(false);
  });

  it("has no orders in the core world", async () => {
    const [, createCore] = subjects({ world: "core" }).find(
      ([candidate]) => candidate === name
    )!;
    const core = createCore().repo;
    expect((await core.orders.listOrders({})).items).toEqual([]);
    await expect(
      core.orders.placeDemoOrder(demoInput("superapp"))
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("stores agree on orders", SLOW, () => {
  /** The same story in both stores, with fixed keys. */
  const story = async (subject: Subject) => {
    const { repo } = subject;
    await repo.wallet.topUp({
      operationId: operationId("tx", "alice_test", "wallet.topUp", "agree-1"),
      fingerprint: fingerprint({ amount: 2_500 }),
      to: alice,
      amount: 2_500,
    });
    await repo.orders.placeOrder(
      orderInput(alice, { key: "agree-order-1", sourceTweetId: "seed-t22" })
    );
    const dropped = await repo.orders.placeOrder(
      orderInput(alice, {
        key: "agree-order-2",
        business: "superapp",
        items: [[MUG, 1]],
        expectedTotal: 1_500,
      })
    );
    await repo.orders.placeDemoOrder(demoInput("kizilaykahve", "agree-demo-1"));
    subject.clock.advance(2 * MINUTE);
    await repo.orders.cancelOrder({ id: dropped.order.id, as: "business" });
  };

  it("after placing, simulating, cancelling and time passing", async () => {
    for (const minutes of [0, 10]) {
      await expectStoresAgree(
        async (repo) => ({
          alice: await repo.orders.listOrders({ buyer: "alice_test" }),
          kizilay: await repo.orders.listOrders({
            business: "kizilaykahve",
            limit: 50,
          }),
          seed: await repo.orders.getOrder("seed-o03"),
          live: await repo.orders.liveActivity("alice_test"),
          aliceNotifications: await repo.listNotifications("alice_test", 50),
          managerNotifications: await repo.listNotifications(DEMO_USERNAME, 50),
          summary: await repo.orders.businessSummary(
            "kizilaykahve",
            SUBJECT_NOW.toISOString()
          ),
          wallets: await Promise.all(
            ["alice_test", "kizilaykahve", "superapp", "demo_customer"].map(
              (username) => repo.wallet.getWallet(username)
            )
          ),
          activity: await repo.wallet.listActivity("alice_test"),
          attachable: await repo.shop.listAttachableProducts(DEMO_USERNAME),
          // How many wallet documents exist is a storage detail.
          audit: { ...(await repo.wallet.audit()), wallets: 0 },
        }),
        {
          prepare: async (subject) => {
            await story(subject);
            subject.clock.advance(minutes * MINUTE);
          },
        }
      );
    }
  });
});

describe("memory order capacity", () => {
  it("refuses new orders when the store is full, keeping every record", async () => {
    const state = createMemoryState(createSeedData(SUBJECT_NOW));
    const seeded = state.orders.orders.size;
    const repo = createMemoryRepository(state, {
      now: () => SUBJECT_NOW,
      limits: { orders: seeded + 1 },
    });
    await repo.wallet.topUp({
      operationId: "tx-cap-1",
      fingerprint: "f",
      to: alice,
      amount: 2_500,
    });
    const input = orderInput(alice);
    await repo.orders.placeOrder(input);
    await expect(
      repo.orders.placeOrder(orderInput(alice))
    ).rejects.toBeInstanceOf(LimitExceededError);
    await expect(
      repo.orders.placeDemoOrder(demoInput("superapp"))
    ).rejects.toBeInstanceOf(LimitExceededError);
    // A replay still answers.
    expect((await repo.orders.placeOrder(input)).replayed).toBe(true);
    expect(state.orders.orders.size).toBe(seeded + 1);
    expect((await repo.wallet.audit()).ok).toBe(true);
  });
});

describe("sanity orders", SLOW, () => {
  const documents = () =>
    seedToSanityDocuments(createSeedData(SUBJECT_NOW, { world: "superapp" }));

  it("are unconfigured without a token and stored as private documents", async () => {
    const client = new FakeSanityClient(documents(), () => SUBJECT_NOW);
    const repo = createSanityRepository(client, { canWrite: false });
    expect(repo.featureStatus("orders")).toBe("unconfigured");

    const orders = client.documents.filter((d) => d._type === "order");
    expect(orders.map((d) => d._id).sort()).toEqual([
      "private.seed-o01",
      "private.seed-o02",
      "private.seed-o03",
    ]);
    expect((PRIVATE_TYPES as readonly string[]).includes("order")).toBe(true);
    client.anonymous = true;
    expect(await client.fetch(`*[_type == "order"]._id`)).toEqual([]);
  });

  it("export the §15 fields, lines keyed, nothing derived", () => {
    const o01 = documents().find((d) => d._id === "private.seed-o01")!;
    expect(o01).toEqual({
      _id: "private.seed-o01",
      _type: "order",
      _createdAt: o01.placedAt,
      buyer: {
        username: DEMO_USERNAME,
        fullname: "Ilhan Ozkan",
        image: "/avatars/illlhanozkan.svg",
      },
      buyerKey: DEMO_USERNAME,
      placedBy: "buyer",
      business: kizilay,
      businessKey: "kizilaykahve",
      category: "cafe",
      lines: [
        {
          _key: "line-1",
          productId: LATTE,
          name: "Pistachio latte",
          unitPrice: 500,
          quantity: 1,
        },
        {
          _key: "line-2",
          productId: SIMIT,
          name: "Simit",
          unitPrice: 250,
          quantity: 1,
        },
      ],
      subtotal: 750,
      deliveryFee: 150,
      total: 900,
      deliveryPlaceId: "tunali",
      code: "K7Q2",
      placedAt: o01.placedAt,
      acceptAt: o01.acceptAt,
      onTheWayAt: o01.onTheWayAt,
      deliverAt: o01.deliverAt,
      paymentTransferId: "seed-tx-o01",
    });
  });

  it("place an order in exactly one transaction with the order first-class", async () => {
    const [, create] = subjects().find(([name]) => name === "sanity")!;
    const subject = create();
    const client = subject.client!;
    await subject.repo.wallet.topUp({
      operationId: "tx-one-1",
      fingerprint: "f",
      to: alice,
      amount: 2_500,
    });
    const commits = client.mutationLog.length;
    const { order } = await subject.repo.orders.placeOrder(orderInput(alice));
    expect(client.mutationLog.length).toBe(commits + 1);
    const [transaction] = client.mutationLog.slice(-1);
    expect(transaction).toContainEqual({
      create: expect.objectContaining({
        _id: `private.${order.id}`,
        _type: "order",
        buyerKey: "alice_test",
        requestHash: expect.any(String),
      }),
    });
    expect(transaction).toContainEqual({
      create: expect.objectContaining({
        _id: `private.${order.paymentTransferId}`,
        _type: "transfer",
        holdUntil: order.deliverAt,
      }),
    });
  });

  it("retry a cancel that loses a race, then report it as already done", async () => {
    const [, create] = subjects().find(([name]) => name === "sanity")!;
    const subject = create();
    const client = subject.client!;
    await subject.repo.wallet.topUp({
      operationId: "tx-race-1",
      fingerprint: "f",
      to: alice,
      amount: 2_500,
    });
    const { order } = await subject.repo.orders.placeOrder(orderInput(alice));

    let competed = false;
    client.beforeMutate = async () => {
      if (competed) return;
      competed = true;
      await subject.repo.orders.cancelOrder({ id: order.id, as: "business" });
    };
    const result = await subject.repo.orders.cancelOrder({
      id: order.id,
      as: "buyer",
    });
    client.beforeMutate = undefined;

    expect(result.changed).toBe(false);
    expect(result.order.cancelledBy).toBe("business");
    expect((await subject.repo.wallet.getWallet("alice_test")).balance).toBe(
      2_500
    );
    await expectLedgerInvariants(subject);
  });
});

describe("C2 seed", () => {
  const world = createSeedData(SUBJECT_NOW);
  const orders = world.superapp!.orders!.orders;
  const transfers = world.superapp!.wallet.transfers;

  it("prices its orders from C1's menus and F's fees", () => {
    expect(orders.map((order) => [order.id, order.code, order.total])).toEqual([
      ["seed-o01", "K7Q2", 900],
      ["seed-o02", "P4R8", 600],
      ["seed-o03", "M2X9", 1_500],
    ]);
    for (const order of orders) {
      expect(order.code).toMatch(ORDER_CODE_PATTERN);
      expect(order.subtotal + order.deliveryFee).toBe(order.total);
    }
  });

  it("contributes one held payment per order, costing the demo user 9.00", () => {
    for (const order of orders) {
      const payment = transfers.find((t) => t.id === order.paymentTransferId);
      expect(payment, order.id).toMatchObject({
        kind: "order",
        amount: order.total,
        from: { username: order.buyer.username },
        to: { username: order.business.username },
        holdUntil: order.deliverAt,
        createdAt: order.placedAt,
        reversedBy: null,
      });
    }
    expect(
      transfers
        .filter((t) => t.kind === "order" && t.from?.username === DEMO_USERNAME)
        .reduce((sum, t) => sum + t.amount, 0)
    ).toBe(900);
    // Only seed-o03 is still on its way.
    const now = SUBJECT_NOW.getTime();
    expect(
      orders.filter((o) => Date.parse(o.deliverAt) > now).map((o) => o.id)
    ).toEqual(["seed-o03"]);
  });
});
