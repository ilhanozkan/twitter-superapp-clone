import { isActiveOrder, ORDER_STATUS_LABELS } from "../../superapp/orders";
import { compareNewestFirst } from "../cursor";
import { INotification } from "../../../types/Notification";
import { IBusinessOrderSummary, IOrder } from "../../../types/Order";
import { ILiveActivity } from "../../../types/Superapp";
import { IAuthor } from "../../../types/User";

// What orders tell people, derived on every read and never stored (§13):
// notifications with stable ids, the buyer's live activity, and a
// business's summary. Both stores gather the orders; these decide.

const lower = (username: string) => username.toLowerCase();

const sellerOf = ({ business }: IOrder): IAuthor => ({
  username: business.username,
  fullname: business.fullname,
  image: business.image,
});

/**
 * Order notifications for `username`: new orders at the businesses they
 * run (`managed`, lower-case; never their own orders), and their own
 * orders once delivered or cancelled by the business. `orders` are read at
 * the same `now`, so "delivered" appears only once it is due.
 */
export function orderNotifications(
  username: string,
  orders: IOrder[],
  managed: string[]
): INotification[] {
  const runs = new Set(managed.map(lower));
  return orders.flatMap((order): INotification[] => {
    const event = (
      kind: "received" | "delivered" | "cancelled",
      createdAt: string,
      actor: IAuthor
    ): INotification => ({
      id: `order-${kind}-${order.id}`,
      type: "order",
      event: kind,
      createdAt,
      actor,
      orderId: order.id,
      code: order.code,
      business: order.business.fullname,
    });

    const mine = lower(order.buyer.username) === lower(username);
    if (!mine) {
      return runs.has(lower(order.business.username))
        ? [event("received", order.placedAt, { ...order.buyer })]
        : [];
    }
    if (order.status === "delivered") {
      return [event("delivered", order.deliverAt, sellerOf(order))];
    }
    if (order.cancelledAt && order.cancelledBy === "business") {
      return [event("cancelled", order.cancelledAt, sellerOf(order))];
    }
    return [];
  });
}

/** An order in progress as the shell shows it: "Order from Kızılay Kahve · On the way". */
export function toLiveActivity(order: IOrder): ILiveActivity {
  return {
    kind: "order",
    id: order.id,
    title: `Order from ${order.business.fullname}`,
    status: ORDER_STATUS_LABELS[order.status],
    eta: order.eta,
    href: `/orders/${encodeURIComponent(order.id)}`,
    nextChangeAt: order.nextChangeAt,
  };
}

/** Orders since a time, minus cancelled ones; what isn't delivered yet is pending. */
export function summarizeOrders(
  orders: Pick<
    IOrder,
    "total" | "deliverAt" | "cancelledAt" | "sourceTweetId"
  >[],
  now: Date
): IBusinessOrderSummary {
  const kept = orders.filter((order) => !order.cancelledAt);
  return {
    orders: kept.length,
    revenue: kept.reduce((sum, order) => sum + order.total, 0),
    pending: kept
      .filter((order) => isActiveOrder(order, now))
      .reduce((sum, order) => sum + order.total, 0),
    fromTweets: kept.filter((order) => order.sourceTweetId !== null).length,
  };
}

/** At most this many delivered orders feed the composer's "ordered before" suggestions. */
export const PURCHASES_READ = 50;

/** The products of `orders` (most recent first), each once, in line order. */
export function productIdsOf(
  orders: { lines: { productId: string }[] }[]
): string[] {
  return [
    ...new Set(orders.flatMap((order) => order.lines.map((l) => l.productId))),
  ];
}

/**
 * The products `username` received in their delivered orders, most recent
 * delivery first (the last PURCHASES_READ orders), each once.
 */
export function purchasedProductIds(
  orders: Iterable<
    Pick<IOrder, "id" | "buyer" | "deliverAt" | "cancelledAt" | "lines">
  >,
  username: string,
  now: Date
): string[] {
  const delivered = [...orders]
    .filter(
      (order) =>
        lower(order.buyer.username) === lower(username) &&
        !order.cancelledAt &&
        Date.parse(order.deliverAt) <= now.getTime()
    )
    .sort((a, b) =>
      compareNewestFirst(
        { createdAt: a.deliverAt, id: a.id },
        { createdAt: b.deliverAt, id: b.id }
      )
    )
    .slice(0, PURCHASES_READ);
  return productIdsOf(delivered);
}
