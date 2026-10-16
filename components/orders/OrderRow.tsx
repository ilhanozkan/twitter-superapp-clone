import Link from "next/link";
import { useId } from "react";

import { IOrder } from "../../types/Order";
import Avatar from "../common/Avatar";
import { Button } from "../common/Button";
import LocalTime from "../superapp/LocalTime";
import Money from "../superapp/Money";
import { itemsText, orderNumber, orderPath, statusLabel } from "./format";

/** "On the way · arrives 14:35", "Delivered · Oct 13", "Cancelled · refunded" */
export function OrderStatusLine({ order }: { order: IOrder }) {
  switch (order.status) {
    case "delivered":
      return (
        <>
          Delivered · <LocalTime iso={order.deliverAt} format="date" />
        </>
      );
    case "cancelled":
      return <>Cancelled · refunded</>;
    default:
      return (
        <>
          {statusLabel(order)} · arrives <LocalTime iso={order.deliverAt} />
        </>
      );
  }
}

/**
 * One of the viewer's orders in a list: the business, the code (a link to
 * the order), the items, the total and where it stands, with Order again
 * once it was delivered.
 */
export default function OrderRow({
  order,
  onOrderAgain,
}: {
  order: IOrder;
  onOrderAgain?: (order: IOrder) => void;
}) {
  const titleId = useId();
  return (
    <article
      aria-labelledby={titleId}
      className="flex gap-3 px-4 py-3 text-[15px] leading-5"
    >
      <Avatar user={order.business} size={40} />
      <div className="min-w-0 flex-1">
        <h3 id={titleId} className="font-bold [overflow-wrap:anywhere]">
          <Link href={orderPath(order.id)} className="hover:underline">
            {order.business.fullname} · {orderNumber(order)}
          </Link>
        </h3>
        <p className="text-muted [overflow-wrap:anywhere]">
          {itemsText(order.lines)}
        </p>
        <p className="text-muted">
          <OrderStatusLine order={order} />
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <Money amount={order.total} />
        {onOrderAgain && order.status === "delivered" && (
          <Button
            size="sm"
            variant="outline"
            aria-label={`Order again from ${order.business.fullname}`}
            onClick={() => onOrderAgain(order)}
          >
            Order again
          </Button>
        )}
      </div>
    </article>
  );
}
