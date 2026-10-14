import { formatCredits } from "../../lib/superapp/money";
import { ComposePrefill } from "../../slices/uiSlice";
import { BusinessCategory } from "../../types/Business";
import { IOrder, IOrderLine } from "../../types/Order";

// The orders feature's wording, in one place so the sheet, checkout, the
// tracker, the lists and the Business board say the same thing.

/** The tracker of an order. */
export const orderPath = (id: string) => `/orders/${encodeURIComponent(id)}`;

export const ORDERS_PATH = "/orders";

/** "#K7Q2" */
export const orderNumber = (order: Pick<IOrder, "code">) => `#${order.code}`;

/** "Pistachio latte ×1, Simit ×2" */
export const itemsText = (lines: Pick<IOrderLine, "name" | "quantity">[]) =>
  lines.map((line) => `${line.name} ×${line.quantity}`).join(", ");

const clock = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * "14:35" in the reader's time zone, as LocalTime renders it. For text that
 * only exists in the browser (announcements, toasts); markup uses
 * LocalTime, which the server renders too.
 */
export const clockText = (iso: string) => clock.format(new Date(iso));

/** Still on its way at the time it was derived for. */
export const inProgress = (order: Pick<IOrder, "status">) =>
  order.status !== "delivered" && order.status !== "cancelled";

/** "Cancelled by Kızılay Kahve" or "You cancelled", from either side's view. */
export function cancelledText(
  order: Pick<IOrder, "cancelledBy" | "business" | "buyer">,
  side: "buyer" | "business"
): string {
  if (order.cancelledBy === side) return "You cancelled";
  return order.cancelledBy === "business"
    ? `Cancelled by ${order.business.fullname}`
    : `Cancelled by ${order.buyer.fullname}`;
}

/**
 * The status as one line of text, e.g. "On the way · Arrives around
 * 14:35", "Delivered at 14:35", "Cancelled by Kızılay Kahve · 9.00 credits
 * refunded". Announced by the tracker's live region.
 */
export function statusText(order: IOrder, side: "buyer" | "business"): string {
  switch (order.status) {
    case "delivered":
      return `Delivered at ${clockText(order.deliverAt)}`;
    case "cancelled":
      return `${cancelledText(order, side)} · ${formatCredits(order.total)} refunded`;
    default:
      return `${statusLabel(order)} · Arrives around ${clockText(order.deliverAt)}`;
  }
}

/** "Placed", "Accepted", "On the way"... (the stage's own label). */
export const statusLabel = (order: Pick<IOrder, "status" | "stages">) =>
  order.stages.find((stage) => stage.status === order.status)?.label ??
  order.status;

const ENJOYED: Record<BusinessCategory, { verb: string; emoji: string }> = {
  cafe: { verb: "had", emoji: "☕" },
  restaurant: { verb: "had", emoji: "😋" },
  healthy: { verb: "had", emoji: "🥗" },
  shop: { verb: "got", emoji: "🛍️" },
};

/**
 * "Tweet about it" after a delivery: compose prefilled with "Just had the
 * Pistachio latte from @kizilaykahve, ordered right from a Tweet ☕
 * #SuperApp" and the product's card.
 */
export function tweetAboutIt(order: IOrder): ComposePrefill {
  const [first] = order.lines;
  const { verb, emoji } = ENJOYED[order.business.category];
  const how = order.sourceTweetId
    ? "ordered right from a Tweet"
    : "ordered on Twitter SuperApp";
  return {
    text: `Just ${verb} the ${first.name} from @${order.business.username}, ${how} ${emoji} #SuperApp`,
    attachment: { type: "product", productId: first.productId },
  };
}
