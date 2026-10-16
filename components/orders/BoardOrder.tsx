import Link from "next/link";

import { IOrder } from "../../types/Order";
import Avatar from "../common/Avatar";
import { Button } from "../common/Button";
import LocalTime from "../superapp/LocalTime";
import Money from "../superapp/Money";
import { cancelledText, itemsText, orderNumber, orderPath } from "./format";
import { OrderStatusLine } from "./OrderRow";

/** The id of an order's heading on the board (focus lands there after a cancel). */
export const boardOrderTitleId = (order: Pick<IOrder, "id">) =>
  `board-order-${order.id}`;

/**
 * An order on the Business board: its code (a link to the order), the
 * buyer (the demo bot says so), the items, the total, where it stands and
 * where it goes, with Cancel & refund while it can still be cancelled.
 */
export default function BoardOrder({
  order,
  onCancel,
  cancelDisabledBy,
}: {
  order: IOrder;
  /** Cancel & refund, while the business may (null hides it). */
  onCancel: ((order: IOrder) => void) | null;
  /** Cancelling is off (a read-only demo), for the reason this element states. */
  cancelDisabledBy?: string;
}) {
  const titleId = boardOrderTitleId(order);
  const demo = order.placedBy === "demo_bot";

  return (
    <article
      aria-labelledby={titleId}
      className="flex gap-3 px-4 py-3 text-[15px] leading-5"
    >
      <Avatar user={order.buyer} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <h3
            id={titleId}
            tabIndex={-1}
            className="min-w-0 font-bold [overflow-wrap:anywhere] focus:outline-none"
          >
            <Link href={orderPath(order.id)} className="hover:underline">
              {orderNumber(order)} · {order.buyer.fullname}
            </Link>
          </h3>
          <Money amount={order.total} className="shrink-0" />
        </div>
        {demo && (
          <p className="mt-0.5">
            <span className="inline-flex rounded-full bg-fg/10 px-2 text-[13px] font-bold leading-5">
              Demo bot
            </span>
          </p>
        )}
        <p className="text-muted [overflow-wrap:anywhere]">
          {itemsText(order.lines)}
        </p>
        <p className="text-muted">
          {order.status === "cancelled" ? (
            `${cancelledText(order, "business")} · refunded`
          ) : (
            <OrderStatusLine order={order} />
          )}
        </p>
        <p className="text-[13px] text-muted">
          To {order.deliveryPlace.name} · placed{" "}
          <LocalTime iso={order.placedAt} />
          {order.sourceTweetId && " · from a Tweet"}
        </p>
        {onCancel && (
          <Button
            size="sm"
            variant="outline"
            aria-label={`Cancel & refund ${orderNumber(order)}`}
            aria-disabled={!!cancelDisabledBy || undefined}
            aria-describedby={cancelDisabledBy}
            onClick={() => {
              if (!cancelDisabledBy) onCancel(order);
            }}
            className="mt-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
          >
            Cancel & refund
          </Button>
        )}
      </div>
    </article>
  );
}
