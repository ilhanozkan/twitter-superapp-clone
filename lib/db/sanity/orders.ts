import { IOrder } from "../../../types/Order";
import { IAuthor } from "../../../types/User";
import {
  clampLimit,
  compareNewestFirst,
  decodeCursor,
  encodeCursor,
} from "../cursor";
import { NotFoundError } from "../errors";
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
  productIdsOf,
  summarizeOrders,
  toLiveActivity,
} from "../orders/views";
import { SanityDeps } from "./deps";
import { KEY_PATTERN, keyOf, privateId } from "./ids";
import {
  ACTIVE_ORDERS_COUNT,
  LIVE_QUERY,
  notificationsQuery,
  ORDER_QUERY,
  ordersQuery,
  PURCHASES_QUERY,
  SUMMARY_QUERY,
} from "./ordersQueries";
import { compact } from "./seeds/documents";

const lower = (username: string) => username.toLowerCase();

const party = (author: IAuthor) =>
  compact({
    username: author.username,
    fullname: author.fullname,
    image: author.image,
  });

/** An order as written, by the app and by the seed export (§15 `order`). */
export function orderDocument(record: OrderRecord) {
  return compact({
    _id: privateId(record.id),
    _type: "order",
    buyer: party(record.buyer),
    buyerKey: lower(record.buyer.username),
    placedBy: record.placedBy,
    business: party(record.business),
    businessKey: lower(record.business.username),
    category: record.business.category,
    lines: record.lines.map((line, index) => ({
      _key: `line-${index + 1}`,
      productId: line.productId,
      name: line.name,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
    })),
    subtotal: record.subtotal,
    deliveryFee: record.deliveryFee,
    total: record.total,
    deliveryPlaceId: record.deliveryPlaceId,
    note: record.note,
    code: record.code,
    sourceTweetId: record.sourceTweetId,
    placedAt: record.placedAt,
    acceptAt: record.acceptAt,
    onTheWayAt: record.onTheWayAt,
    deliverAt: record.deliverAt,
    cancelledAt: record.cancelledAt,
    cancelledBy: record.cancelledBy,
    paymentTransferId: record.paymentTransferId,
    refundTransferId: record.refundTransferId,
    requestHash: record.requestHash,
  });
}

type Party = { username: string; fullname: string; image?: string | null };

/** An order document as ORDER_FIELDS reads it (absent fields come back as null or missing). */
export interface OrderRow extends Omit<
  OrderRecord,
  "buyer" | "business" | "lines" | "requestHash"
> {
  buyer: Party;
  business: Party;
  category: OrderRecord["business"]["category"];
  lines: Omit<IOrder["lines"][number], "total">[] | null;
}

export function orderFromRow(row: OrderRow): OrderRecord {
  return {
    id: keyOf(row.id),
    code: row.code,
    buyer: { ...row.buyer, image: row.buyer.image ?? null },
    placedBy: row.placedBy,
    business: {
      ...row.business,
      image: row.business.image ?? null,
      category: row.category,
    },
    lines: (row.lines ?? []).map((line) => ({
      ...line,
      total: line.unitPrice * line.quantity,
    })),
    subtotal: row.subtotal,
    deliveryFee: row.deliveryFee,
    total: row.total,
    deliveryPlaceId: row.deliveryPlaceId,
    note: row.note ?? null,
    sourceTweetId: row.sourceTweetId ?? null,
    placedAt: row.placedAt,
    acceptAt: row.acceptAt,
    onTheWayAt: row.onTheWayAt,
    deliverAt: row.deliverAt,
    cancelledAt: row.cancelledAt ?? null,
    cancelledBy: row.cancelledBy ?? null,
    paymentTransferId: row.paymentTransferId,
    refundTransferId: row.refundTransferId ?? null,
    requestHash: null,
  };
}

/** The products of `username`'s latest delivered orders (the shop reads it while orders are on). */
export async function readPurchasedProductIds(
  deps: Pick<SanityDeps, "read" | "now">,
  username: string
): Promise<string[]> {
  const rows = await deps.read<{ lines: { productId: string }[] }[] | null>(
    PURCHASES_QUERY,
    { key: lower(username), now: deps.now().toISOString() }
  );
  return productIdsOf(rows ?? []);
}

/** Raised inside a cancel's prepare when a concurrent cancel already won. */
class AlreadyCancelled extends Error {
  constructor(readonly order: IOrder) {
    super("Already cancelled");
  }
}

/**
 * Orders on Sanity: private documents, so the feature needs a token.
 * Placing an order is one ledger commit (the order document is its primary
 * record): the buyer's wallet revision locks their orders, so the count of
 * orders in progress read in the same snapshot stays exact; the business
 * and its products are re-read on every attempt.
 */
export function createSanityOrders(deps: SanityDeps): OrdersRepository {
  const { read, ledger, now } = deps;
  const repo = () => deps.self();

  const readRow = async (id: string) => {
    if (!KEY_PATTERN.test(id)) return null;
    return read<(OrderRow & { _rev: string }) | null>(ORDER_QUERY, {
      id: privateId(id),
    });
  };

  const getOrder = async (id: string) => {
    const row = await readRow(id);
    return row ? toOrder(orderFromRow(row), now()) : null;
  };

  const getWallet = (username: string) => repo().wallet.getWallet(username);

  const readOrders = async (
    query: string,
    params: Record<string, unknown>
  ): Promise<OrderRecord[]> =>
    ((await read<OrderRow[] | null>(query, params)) ?? []).map(orderFromRow);

  return {
    implemented: true,
    configured: deps.canReadPrivate,

    async notifications(username, limit) {
      const safeLimit = Math.max(0, Math.floor(limit));
      if (safeLimit === 0) return [];
      const managed = await repo().business.listManagedBusinesses(username);
      const at = now();
      const row = await read<Record<
        "received" | "delivered" | "cancelled",
        OrderRow[]
      > | null>(notificationsQuery(safeLimit), {
        key: lower(username),
        managed: managed.map(lower),
        now: at.toISOString(),
      });
      const orders = [
        ...(row?.received ?? []),
        ...(row?.delivered ?? []),
        ...(row?.cancelled ?? []),
      ].map((order) => toOrder(orderFromRow(order), at));
      return orderNotifications(username, orders, managed)
        .sort(compareNewestFirst)
        .slice(0, safeLimit);
    },

    async liveActivity(username) {
      const at = now();
      const records = await readOrders(LIVE_QUERY, {
        key: lower(username),
        now: at.toISOString(),
      });
      return records.map((record) => toLiveActivity(toOrder(record, at)));
    },

    async placeOrder(input) {
      deps.assertWritable();
      const buyer = input.buyer.username;
      // Who gets paid never changes, so it can be read before the snapshot.
      const found = await repo().business.getBusiness(input.business);
      const productIds = input.lines.map((line) => line.productId);

      const { result, replayed } = await ledger.commit({
        operationId: input.operationId,
        fingerprint: input.fingerprint,
        primaryType: "order",
        parties: [buyer, found?.username ?? input.business],
        // Serializes the buyer's orders, so at most 5 are ever in progress.
        locks: [buyer],
        counts: {
          activeOrders: {
            query: ACTIVE_ORDERS_COUNT,
            params: { key: lower(buyer) },
          },
        },
        replay: async () => ({
          order: (await getOrder(input.operationId))!,
          wallet: await getWallet(buyer),
        }),
        prepare: async (snapshot) => {
          const [business, products] = await Promise.all([
            found ? repo().business.getBusiness(found.username) : null,
            repo().shop.getProducts(productIds),
          ]);
          const { record, transfers } = planOrder(input, {
            business,
            products,
            now: snapshot.now,
            timeScale: deps.timeScale,
            activeOrders: snapshot.counts.activeOrders,
          });
          return {
            transfers,
            mutations: () => [{ create: orderDocument(record) }],
            result: async () => ({
              order: toOrder(record, snapshot.now),
              wallet: await getWallet(buyer),
            }),
          };
        },
      });
      return { ...result, replayed };
    },

    async placeDemoOrder(input) {
      deps.assertWritable();
      const [found, user] = await Promise.all([
        repo().business.getBusiness(input.business),
        repo().getUser(DEMO_CUSTOMER.username),
      ]);
      const customer: IAuthor = user
        ? {
            username: user.username,
            fullname: user.fullname,
            image: user.image,
          }
        : DEMO_CUSTOMER;

      const { result, replayed } = await ledger.commit({
        operationId: input.operationId,
        fingerprint: input.fingerprint,
        primaryType: "order",
        parties: [customer.username, found?.username ?? input.business],
        replay: async () => (await getOrder(input.operationId))!,
        prepare: async (snapshot) => {
          const [business, menu] = await Promise.all([
            found ? repo().business.getBusiness(found.username) : null,
            found ? repo().shop.getMenu(found.username) : [],
          ]);
          const { record, transfers } = planDemoOrder(input, {
            business,
            products: menu.flatMap((section) => section.products),
            customer,
            now: snapshot.now,
            timeScale: deps.timeScale,
          });
          return {
            transfers,
            mutations: () => [{ create: orderDocument(record) }],
            result: () => toOrder(record, snapshot.now),
          };
        },
      });
      return { order: result, replayed };
    },

    getOrder,

    async listOrders(query) {
      const limit = clampLimit(query.limit);
      const cursor = decodeCursor(query.cursor);
      const params: Record<string, unknown> = { now: now().toISOString() };
      if (query.buyer) params.buyer = lower(query.buyer);
      if (query.business) params.business = lower(query.business);
      if (cursor) {
        params.cursorPlacedAt = cursor.createdAt;
        params.cursorId = KEY_PATTERN.test(cursor.id)
          ? privateId(cursor.id)
          : cursor.id;
      }
      const at = new Date(params.now as string);
      const records = await readOrders(
        ordersQuery(
          {
            buyer: !!query.buyer,
            business: !!query.business,
            state: query.state,
            cursor: !!cursor,
          },
          limit + 1
        ),
        params
      );
      const page = records.slice(0, limit);
      const last = page[page.length - 1];
      return {
        items: page.map((record) => toOrder(record, at)),
        nextCursor:
          records.length > limit && last
            ? encodeCursor({ createdAt: last.placedAt, id: last.id })
            : null,
      };
    },

    async cancelOrder({ id, as }) {
      deps.assertWritable();
      const row = await readRow(id);
      if (!row) throw new NotFoundError("Order not found");
      const stored = orderFromRow(row);
      if (stored.cancelledAt) {
        return { order: toOrder(stored, now()), changed: false };
      }

      try {
        const { result, replayed } = await ledger.commit({
          operationId: refundTransferId(stored.paymentTransferId),
          fingerprint: CANCEL_FINGERPRINT,
          primaryType: "transfer",
          parties: [stored.business.username, stored.buyer.username],
          reverses: [stored.paymentTransferId],
          replay: async () => (await getOrder(id))!,
          prepare: async (snapshot) => {
            // Re-read on every attempt: the order's patch is guarded by this _rev.
            const current = await readRow(id);
            if (!current) throw new NotFoundError("Order not found");
            const record = orderFromRow(current);
            const refund = planCancel(toOrder(record, snapshot.now), as);
            if (!refund) {
              throw new AlreadyCancelled(toOrder(record, snapshot.now));
            }
            const cancelled = (written: { id: string; createdAt: string }) => ({
              cancelledAt: written.createdAt,
              cancelledBy: as,
              refundTransferId: written.id,
            });
            return {
              transfers: [refund],
              mutations: ([written]) => [
                {
                  patch: {
                    id: privateId(id),
                    ifRevisionID: current._rev,
                    set: cancelled(written),
                  },
                },
              ],
              result: ([written]) =>
                toOrder({ ...record, ...cancelled(written) }, snapshot.now),
            };
          },
        });
        return { order: result, changed: !replayed };
      } catch (error) {
        if (error instanceof AlreadyCancelled) {
          return { order: error.order, changed: false };
        }
        throw error;
      }
    },

    async businessSummary(business, since) {
      const rows =
        (await read<
          {
            total: number;
            deliverAt: string;
            cancelledAt?: string | null;
            sourceTweetId?: string | null;
          }[]
        >(SUMMARY_QUERY, { key: lower(business), since })) ?? [];
      return summarizeOrders(
        rows.map((row) => ({
          total: row.total,
          deliverAt: row.deliverAt,
          cancelledAt: row.cancelledAt ?? null,
          sourceTweetId: row.sourceTweetId ?? null,
        })),
        now()
      );
    },
  };
}
