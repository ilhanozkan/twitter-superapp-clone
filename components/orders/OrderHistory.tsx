import { useId, useState } from "react";

import { errorMessage } from "../../lib/client/api";
import { ordersApi } from "../../lib/client/ordersApi";
import { orderAt } from "../../lib/superapp/orders";
import { ordersReceived } from "../../slices/ordersSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { IOrder } from "../../types/Order";
import { ButtonLink, Button } from "../common/Button";
import EmptyState from "../common/EmptyState";
import Spinner from "../common/Spinner";
import { FOOD_PATH } from "../shop/paths";
import { inProgress } from "./format";
import OrderRow from "./OrderRow";
import { useOrderAgain } from "./useOrderAgain";
import { useServerTime } from "./useServerTime";

export const PAST_PAGE_SIZE = 20;
/** Lists show where orders stand; a few seconds late is fine. */
const TICK_MS = 5_000;

/**
 * The viewer's orders: Active (on their way) and Past (delivered or
 * cancelled, newest first, a page at a time), each a link to its tracker.
 * The orders are in the store (the page put them there), so a cancel made
 * elsewhere shows here, and an order that arrives while the page is open
 * moves from Active to Past.
 */
export default function OrderHistory({
  ids,
  nextCursor,
  serverNow,
}: {
  /** The orders the page read (active first), kept in the store. */
  ids: string[];
  nextCursor: string | null;
  serverNow: string;
}) {
  const dispatch = useAppDispatch();
  const entities = useAppSelector((state) => state.orders.entities);
  const [shown, setShown] = useState(ids);
  const [cursor, setCursor] = useState(nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { orderAgain, prompt } = useOrderAgain();
  const activeHeadingId = useId();
  const pastHeadingId = useId();

  const orders = shown.flatMap((id): IOrder[] => {
    const entry = entities[id];
    return entry ? [entry.order] : [];
  });
  const anyActive = orders.some(inProgress);
  const now = useServerTime(serverNow, TICK_MS, anyActive);
  const derived = orders.map((order) => orderAt(order, new Date(now)));
  const active = derived.filter(inProgress);
  const past = derived
    .filter((order) => !inProgress(order))
    .sort((a, b) => b.placedAt.localeCompare(a.placedAt));

  const showMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const page = await ordersApi.listOrders({
        state: "past",
        limit: PAST_PAGE_SIZE,
        cursor,
      });
      dispatch(
        ordersReceived({ orders: page.items, serverNow: page.serverNow })
      );
      setShown((current) => [
        ...current,
        ...page.items
          .map((order) => order.id)
          .filter((id) => !current.includes(id)),
      ]);
      setCursor(page.nextCursor);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  if (orders.length === 0) {
    return (
      <EmptyState
        title="No orders yet"
        action={<ButtonLink href={FOOD_PATH}>Browse Food</ButtonLink>}
      >
        Order from a Tweet’s product card or a business’s menu, and you can
        follow it here.
      </EmptyState>
    );
  }

  return (
    <>
      <section
        aria-labelledby={activeHeadingId}
        className="border-b border-line"
      >
        <h2
          id={activeHeadingId}
          className="px-4 pb-1 pt-4 text-xl font-extrabold"
        >
          Active
        </h2>
        {active.length === 0 ? (
          <p className="px-4 pb-4 text-[15px] text-muted">
            Nothing on its way right now.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {active.map((order) => (
              <li key={order.id}>
                <OrderRow order={order} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={pastHeadingId}>
        <h2
          id={pastHeadingId}
          className="px-4 pb-1 pt-4 text-xl font-extrabold"
        >
          Past
        </h2>
        {past.length === 0 ? (
          <p className="px-4 pb-4 text-[15px] text-muted">
            Delivered and cancelled orders show up here.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {past.map((order) => (
              <li key={order.id}>
                <OrderRow order={order} onOrderAgain={orderAgain} />
              </li>
            ))}
          </ul>
        )}
        {loading && <Spinner label="Loading more orders" />}
        {error && (
          <p role="alert" className="px-4 py-2 text-[15px] text-danger">
            {error}
          </p>
        )}
        {cursor && !loading && (
          <div className="px-4 py-4">
            <Button variant="outline" onClick={showMore}>
              {error ? "Retry" : "Show more"}
            </Button>
          </div>
        )}
      </section>
      {prompt}
    </>
  );
}
