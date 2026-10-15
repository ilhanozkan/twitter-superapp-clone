import { useId } from "react";

import { IOrder } from "../../types/Order";
import Avatar from "../common/Avatar";
import { Button } from "../common/Button";
import { revealFocusedItem } from "../common/revealFocusedItem";
import Money from "../superapp/Money";
import { itemsText } from "./format";
import { useOrderAgain } from "./useOrderAgain";

/** Recent places on the Food hub, one card each. */
export const ORDER_AGAIN_MAX = 3;

/**
 * The latest delivered order from each of a few places, taken from the
 * viewer's past orders (newest first).
 */
export function orderAgainChoices(orders: IOrder[]): IOrder[] {
  const seen = new Set<string>();
  return orders
    .filter((order) => order.status === "delivered")
    .filter((order) => {
      const key = order.business.username.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, ORDER_AGAIN_MAX);
}

/**
 * "Order again" on the Food hub (§4.8): recent orders as a row that
 * scrolls sideways (a native list), each refilling the cart and opening
 * checkout. Hidden until the viewer has had something delivered.
 */
export default function OrderAgainRow({ orders }: { orders: IOrder[] }) {
  const headingId = useId();
  const { orderAgain, prompt } = useOrderAgain();
  if (orders.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="border-b border-line">
      <h2 id={headingId} className="px-4 pt-3 text-xl font-extrabold">
        Order again
      </h2>
      <ul
        onFocus={revealFocusedItem}
        className="flex gap-3 overflow-x-auto px-4 pb-4 pt-2"
      >
        {orders.map((order) => (
          <li
            key={order.id}
            className="flex w-64 shrink-0 flex-col gap-2 rounded-2xl border border-line p-3 text-[15px] leading-5"
          >
            <div className="flex items-center gap-2">
              <Avatar user={order.business} size={32} />
              <p className="min-w-0 truncate font-bold">
                {order.business.fullname}
              </p>
            </div>
            <p className="line-clamp-2 text-muted">{itemsText(order.lines)}</p>
            <div className="mt-auto flex items-center justify-between gap-2">
              <Money amount={order.total} />
              <Button
                size="sm"
                aria-label={`Order again from ${order.business.fullname}`}
                onClick={() => orderAgain(order)}
              >
                Order again
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {prompt}
    </section>
  );
}
