import { managedBusinesses } from "../../superapp/business";
import { isActiveOrder } from "../../superapp/orders";
import { productsOf } from "../../superapp/shop";
import { toWallet } from "../../superapp/wallet";
import {
  clampLimit,
  compareNewestFirst,
  decodeCursor,
  encodeCursor,
  isAfterCursor,
} from "../cursor";
import { LimitExceededError, NotFoundError } from "../errors";
import { planCancel, planDemoOrder, planOrder } from "../orders/plan";
import {
  CANCEL_FINGERPRINT,
  DEMO_CUSTOMER,
  OrderRecord,
  refundTransferId,
  toOrder,
} from "../orders/records";
import { OrdersRepository } from "../orders/types";
import {
  orderNotifications,
  summarizeOrders,
  toLiveActivity,
} from "../orders/views";
import { OrdersSeed } from "../seeds/orders";
import { MemoryDeps } from "./deps";
import { memoryCatalog } from "./shop";

export interface OrdersMemoryState {
  /** Never evicted: past `limits.orders`, new orders are refused. */
  orders: Map<string, OrderRecord>;
}

export const createOrdersMemoryState = (
  seed: OrdersSeed | null
): OrdersMemoryState => ({
  orders: new Map(
    (seed?.orders ?? []).map((order) => [order.id, structuredClone(order)])
  ),
});

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** By (placedAt, id), newest first, like every page in the app. */
const byPlacedAt = (order: OrderRecord) => ({
  createdAt: order.placedAt,
  id: order.id,
});

/**
 * Orders in memory. Placing, simulating and cancelling each run inside one
 * synchronous ledger commit: the business, its products and the buyer's
 * orders in progress are read there, so the 5-orders limit is exact and a
 * price can't change between the check and the payment.
 */
export function createMemoryOrders(deps: MemoryDeps): OrdersRepository {
  const { state, now, ledger, limits, timeScale } = deps;
  const { orders } = state.orders;

  const readWallet = (username: string) =>
    toWallet(username, ledger.view().wallet(username));

  const read = (id: string, at = now()) => {
    const record = orders.get(id);
    return record ? toOrder(record, at) : null;
  };

  const assertCapacity = () => {
    if (orders.size >= limits.orders) {
      throw new LimitExceededError(
        "The demo store is full; restart the server"
      );
    }
  };

  /** The business and its products as the shop shows them at `at`. */
  const catalogOf = (username: string, at: Date) => {
    const { businesses, entries } = memoryCatalog(state, at);
    const business =
      businesses.find((candidate) => same(candidate.username, username)) ??
      null;
    return {
      business,
      products: business ? productsOf(entries, business.username) : [],
    };
  };

  const activeOrdersOf = (buyer: string, at: Date) =>
    [...orders.values()].filter(
      (order) => same(order.buyer.username, buyer) && isActiveOrder(order, at)
    ).length;

  /** The fingerprint an order was placed with ("" for seeds), if it exists. */
  const hashOf = (id: string) => {
    const record = orders.get(id);
    return record ? (record.requestHash ?? "") : undefined;
  };

  return {
    implemented: true,
    configured: true,

    async notifications(username, limit) {
      const at = now();
      const safeLimit = Math.max(0, Math.floor(limit));
      const managed = managedBusinesses(
        memoryCatalog(state, at).businesses,
        username
      );
      return orderNotifications(
        username,
        [...orders.values()].map((record) => toOrder(record, at)),
        managed
      )
        .sort(compareNewestFirst)
        .slice(0, safeLimit);
    },

    async liveActivity(username) {
      const at = now();
      return [...orders.values()]
        .filter(
          (order) =>
            same(order.buyer.username, username) && isActiveOrder(order, at)
        )
        .sort((a, b) => compareNewestFirst(byPlacedAt(a), byPlacedAt(b)))
        .map((record) => toLiveActivity(toOrder(record, at)));
    },

    async placeOrder(input) {
      const { result, replayed } = ledger.commit({
        operationId: input.operationId,
        fingerprint: input.fingerprint,
        storedFingerprint: () => hashOf(input.operationId),
        replay: () => ({
          order: read(input.operationId)!,
          wallet: readWallet(input.buyer.username),
        }),
        prepare: (view) => {
          assertCapacity();
          const { record, transfers } = planOrder(input, {
            ...catalogOf(input.business, view.now),
            now: view.now,
            timeScale,
            activeOrders: activeOrdersOf(input.buyer.username, view.now),
          });
          return {
            transfers,
            apply: () => {
              orders.set(record.id, record);
              return {
                order: toOrder(record, view.now),
                wallet: readWallet(input.buyer.username),
              };
            },
          };
        },
      });
      return { ...result, replayed };
    },

    async placeDemoOrder(input) {
      const customer = state.users.get(DEMO_CUSTOMER.username);
      const { result, replayed } = ledger.commit({
        operationId: input.operationId,
        fingerprint: input.fingerprint,
        storedFingerprint: () => hashOf(input.operationId),
        replay: () => read(input.operationId)!,
        prepare: (view) => {
          assertCapacity();
          const { record, transfers } = planDemoOrder(input, {
            ...catalogOf(input.business, view.now),
            now: view.now,
            timeScale,
            customer: customer
              ? {
                  username: customer.username,
                  fullname: customer.fullname,
                  image: customer.image,
                }
              : DEMO_CUSTOMER,
          });
          return {
            transfers,
            apply: () => {
              orders.set(record.id, record);
              return toOrder(record, view.now);
            },
          };
        },
      });
      return { order: result, replayed };
    },

    async getOrder(id) {
      return read(id);
    },

    async listOrders(query) {
      const at = now();
      const limit = clampLimit(query.limit);
      const cursor = decodeCursor(query.cursor);
      const matches = [...orders.values()]
        .filter(
          (order) =>
            (!query.buyer || same(order.buyer.username, query.buyer)) &&
            (!query.business ||
              same(order.business.username, query.business)) &&
            (!query.state ||
              (query.state === "active") === isActiveOrder(order, at)) &&
            (!cursor || isAfterCursor(byPlacedAt(order), cursor))
        )
        .sort((a, b) => compareNewestFirst(byPlacedAt(a), byPlacedAt(b)));

      const page = matches.slice(0, limit);
      const last = page[page.length - 1];
      return {
        items: page.map((record) => toOrder(record, at)),
        nextCursor:
          matches.length > limit && last
            ? encodeCursor(byPlacedAt(last))
            : null,
      };
    },

    async cancelOrder({ id, as }) {
      const record = orders.get(id);
      if (!record) throw new NotFoundError("Order not found");
      if (record.cancelledAt) {
        return { order: toOrder(record, now()), changed: false };
      }

      const refundId = refundTransferId(record.paymentTransferId);
      const { result, replayed } = ledger.commit({
        operationId: refundId,
        fingerprint: CANCEL_FINGERPRINT,
        // Only a cancellation ever writes this refund.
        storedFingerprint: () =>
          state.wallet.transfers.has(refundId) ? CANCEL_FINGERPRINT : undefined,
        replay: () => toOrder(record, now()),
        prepare: (view) => {
          const refund = planCancel(toOrder(record, view.now), as)!;
          return {
            transfers: [refund],
            apply: ([written]) => {
              record.cancelledAt = written.createdAt;
              record.cancelledBy = as;
              record.refundTransferId = written.id;
              return toOrder(record, view.now);
            },
          };
        },
      });
      return { order: result, changed: !replayed };
    },

    async businessSummary(business, since) {
      const from = Date.parse(since);
      return summarizeOrders(
        [...orders.values()].filter(
          (order) =>
            same(order.business.username, business) &&
            Date.parse(order.placedAt) >= from
        ),
        now()
      );
    },
  };
}
