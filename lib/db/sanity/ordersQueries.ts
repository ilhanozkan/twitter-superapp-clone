import { PURCHASES_READ } from "../orders/views";
import { PUBLISHED } from "./groq";

// GROQ for orders: private documents ("private." ids), read with `$now`
// from the app's clock. Every query follows the rules in ./groq; only
// validated integers are interpolated.

const party = (field: string) =>
  `${field}{ "username": username, "fullname": coalesce(fullname, username), "image": image }`;

/** An order document as `orderFromRow` reads it; `id` is the private id. */
export const ORDER_FIELDS = `"id": _id, code, ${party("buyer")}, placedBy, ${party(
  "business"
)}, category, "lines": lines[]{ productId, name, unitPrice, quantity }, subtotal, deliveryFee, total, deliveryPlaceId, note, sourceTweetId, placedAt, acceptAt, onTheWayAt, deliverAt, cancelledAt, cancelledBy, paymentTransferId, refundTransferId`;

/** Neither cancelled nor delivered at `$now`. */
const ACTIVE = `!defined(cancelledAt) && dateTime(deliverAt) > dateTime($now)`;
/** Not cancelled, and delivered by `$now`. */
const DELIVERED = `!defined(cancelledAt) && dateTime(deliverAt) <= dateTime($now)`;

export const ORDER_QUERY = `*[_type == "order" && _id == $id && ${PUBLISHED}][0]{ ${ORDER_FIELDS}, _rev }`;

/** The buyer's orders in progress: the ledger reads it in its snapshot, under the buyer's lock. */
export const ACTIVE_ORDERS_COUNT = `count(*[_type == "order" && buyerKey == $key && ${ACTIVE} && ${PUBLISHED}])`;

const PAGE_CURSOR =
  "(dateTime(placedAt) < dateTime($cursorPlacedAt) || " +
  "(dateTime(placedAt) == dateTime($cursorPlacedAt) && _id < $cursorId))";

/** Newest first by (placedAt, id), like the memory store; `fetchCount` is a validated integer. */
export function ordersQuery(
  filters: {
    buyer: boolean;
    business: boolean;
    state?: "active" | "past";
    cursor: boolean;
  },
  fetchCount: number
): string {
  const clauses = [
    `_type == "order"`,
    ...(filters.buyer ? ["buyerKey == $buyer"] : []),
    ...(filters.business ? ["businessKey == $business"] : []),
    ...(filters.state === "active" ? [ACTIVE] : []),
    ...(filters.state === "past" ? [`!(${ACTIVE})`] : []),
    ...(filters.cursor ? [PAGE_CURSOR] : []),
    PUBLISHED,
  ];
  return `*[${clauses.join(" && ")}] | order(placedAt desc, _id desc) [0...${fetchCount}] { ${ORDER_FIELDS} }`;
}

/**
 * What order notifications are made of, each list newest first: new
 * orders at the businesses `$managed` (lower-case) by someone else, and the
 * buyer's own orders once delivered or cancelled by the business.
 */
export const notificationsQuery = (limit: number) => `{
  "received": *[_type == "order" && businessKey in $managed && buyerKey != $key && ${PUBLISHED}] | order(placedAt desc, _id desc) [0...${limit}] { ${ORDER_FIELDS} },
  "delivered": *[_type == "order" && buyerKey == $key && ${DELIVERED} && ${PUBLISHED}] | order(deliverAt desc, _id desc) [0...${limit}] { ${ORDER_FIELDS} },
  "cancelled": *[_type == "order" && buyerKey == $key && cancelledBy == "business" && ${PUBLISHED}] | order(cancelledAt desc, _id desc) [0...${limit}] { ${ORDER_FIELDS} }
}`;

/** The buyer's orders in progress (at most 5), newest first. */
export const LIVE_QUERY = `*[_type == "order" && buyerKey == $key && ${ACTIVE} && ${PUBLISHED}] | order(placedAt desc, _id desc) { ${ORDER_FIELDS} }`;

/** A business's orders placed since `$since`. */
export const SUMMARY_QUERY = `*[_type == "order" && businessKey == $key && dateTime(placedAt) >= dateTime($since) && ${PUBLISHED}]{ total, deliverAt, cancelledAt, sourceTweetId }`;

/** The products of the buyer's latest delivered orders. */
export const PURCHASES_QUERY = `*[_type == "order" && buyerKey == $key && ${DELIVERED} && ${PUBLISHED}] | order(deliverAt desc, _id desc) [0...${PURCHASES_READ}] { "lines": coalesce(lines[]{ productId }, []) }`;
