import { useEffect, useId, useRef, useState } from "react";

import { errorMessage } from "../../lib/client/api";
import { ordersApi } from "../../lib/client/ordersApi";
import { usePolling } from "../../lib/client/usePolling";
import { useServerClock } from "../../lib/client/useServerClock";
import { pluralize } from "../../lib/format";
import { formatAmount, formatCredits } from "../../lib/superapp/money";
import { orderAt } from "../../lib/superapp/orders";
import { OrderEntry, ordersReceived } from "../../slices/ordersSlice";
import { showToast } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { IBusinessOrderSummary, IOrder } from "../../types/Order";
import { IWallet } from "../../types/Wallet";
import { Button } from "../common/Button";
import Spinner from "../common/Spinner";
import DemoBadge from "../superapp/DemoBadge";
import BoardOrder, { boardOrderTitleId } from "./BoardOrder";
import CancelOrderDialog from "./CancelOrderDialog";
import DemoOrderButton from "./DemoOrderButton";
import { inProgress, orderNumber } from "./format";
import { useServerTime } from "./useServerTime";

/** What the Business page reads on the server for its Orders tab. */
export interface BoardData {
  summary: IBusinessOrderSummary;
  /** The business's wallet (Available · Pending); null while the wallet is off. */
  wallet: IWallet | null;
  /** Where "today" started in the business's time zone. */
  since: string;
  /** In progress first, then the latest completed ones; all in the store. */
  ids: string[];
  /** More completed orders after these. */
  nextCursor: string | null;
  serverNow: string;
}

const focusLost = () =>
  !document.activeElement || document.activeElement === document.body;

/** SSR + poll 10 s (§4.13). */
export const BOARD_POLL_MS = 10_000;
const TICK_MS = 5_000;
const AFTER_CHANGE_MS = 500;
const PAGE_SIZE = 20;

/** "Today: 4 orders · 63.00 credits · 15.00 pending" */
export function summaryText({
  orders,
  revenue,
  pending,
}: IBusinessOrderSummary) {
  if (orders === 0) return "No orders yet today";
  return `Today: ${pluralize(orders, "order")} · ${formatCredits(revenue)} · ${formatAmount(pending)} pending`;
}

const newestFirst = (a: IOrder, b: IOrder) =>
  b.placedAt.localeCompare(a.placedAt) || b.id.localeCompare(a.id);

/**
 * The Business board (the Orders tab, §4.7): today's summary and the
 * business's wallet, "Simulate a customer order · Demo bot", then the
 * orders In progress (with Cancel & refund behind a confirmation) and
 * Completed, side by side from 1024px. It polls every 10 s while visible,
 * and right after an order is due to change.
 */
export default function MerchantBoard({
  business,
  data,
  reasonId,
}: {
  business: { username: string; fullname: string };
  data: BoardData;
  /** On a read-only demo: the element saying why nothing can change. */
  reasonId?: string;
}) {
  const dispatch = useAppDispatch();
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const walletOn = useAppSelector((state) => state.session.features.wallet);
  const entities = useAppSelector((state) => state.orders.entities);
  const [ids, setIds] = useState(data.ids);
  const [summary, setSummary] = useState(data.summary);
  const [wallet, setWallet] = useState(data.wallet);
  const [serverNow, setServerNow] = useState(data.serverNow);
  const [cursor, setCursor] = useState(data.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  // The order the confirmation is about stays set after it closes, so the
  // dialog can return focus to the button that opened it.
  const [target, setTarget] = useState<IOrder | null>(null);
  const [confirming, setConfirming] = useState(false);
  const summaryHeadingId = useId();
  const activeHeadingId = useId();
  const doneHeadingId = useId();

  const orders = ids.flatMap((id): IOrder[] => {
    const entry = entities[id];
    return entry ? [entry.order] : [];
  });
  const anyActive = orders.some(inProgress);
  const now = useServerTime(serverNow, TICK_MS, anyActive);
  const clock = useServerClock(serverNow);
  const derived = orders.map((order) => orderAt(order, new Date(now)));
  const active = derived.filter(inProgress).sort(newestFirst);
  const done = derived.filter((order) => !inProgress(order)).sort(newestFirst);

  const add = (more: string[]) =>
    setIds((current) => [
      ...more.filter((id) => !current.includes(id)),
      ...current,
    ]);

  // The orders still in progress and today's numbers. Orders that have
  // left the list since stay (as Completed), from the store.
  const { failures, refreshNow } = usePolling(
    async () => {
      const [page, latest] = await Promise.all([
        ordersApi.listOrders({
          as: "business",
          business: business.username,
          state: "active",
          limit: 50,
        }),
        ordersApi.getSummary(business.username, data.since),
      ]);
      dispatch(
        ordersReceived({ orders: page.items, serverNow: page.serverNow })
      );
      add(page.items.map((order) => order.id));
      setSummary(latest.summary);
      setWallet(latest.wallet);
      // When the list was read: what is due before then has left it.
      setServerNow(page.serverNow);
    },
    { interval: BOARD_POLL_MS }
  );

  // Read from the server's copies, which change only when a poll answers:
  // copies re-derived on the 5 s tick change on the tick that passes a
  // change, and would cancel this timer if it came less than 500 ms after.
  // A copy due before the last poll is of an order that has left the list
  // since (delivered or cancelled), and is never asked about again.
  const nextChange = orders
    .map((order) => order.nextChangeAt)
    .filter(
      (at): at is string =>
        at !== null && Date.parse(at) > Date.parse(serverNow)
    )
    .sort()[0];
  useEffect(() => {
    if (!nextChange) return;
    const wait = Date.parse(nextChange) - clock.now().getTime();
    const timer = setTimeout(refreshNow, Math.max(0, wait) + AFTER_CHANGE_MS);
    return () => clearTimeout(timer);
  }, [nextChange, clock, refreshNow]);

  const showMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await ordersApi.listOrders({
        as: "business",
        business: business.username,
        state: "past",
        limit: PAGE_SIZE,
        cursor,
      });
      dispatch(
        ordersReceived({ orders: page.items, serverNow: page.serverNow })
      );
      setIds((current) => [
        ...current,
        ...page.items
          .map((order) => order.id)
          .filter((id) => !current.includes(id)),
      ]);
      setCursor(page.nextCursor);
    } catch (reason) {
      dispatch(showToast({ message: errorMessage(reason), tone: "error" }));
    } finally {
      setLoadingMore(false);
    }
  };

  const confirmCancel = (order: IOrder) => {
    setTarget(order);
    setConfirming(true);
  };

  // After a cancel the order moves to Completed and its button is gone:
  // once the dialog has closed (and the browser found nothing to return
  // focus to), focus follows the order.
  const refocus = useRef<string | null>(null);
  const closeConfirm = () => {
    setConfirming(false);
    setTimeout(() => {
      const id = refocus.current;
      if (!id || !focusLost()) return;
      refocus.current = null;
      document.getElementById(id)?.focus();
    }, 0);
  };

  const cancelled = ({ order }: OrderEntry) => {
    refocus.current = boardOrderTitleId(order);
    closeConfirm();
    dispatch(
      showToast({
        message: `Order ${orderNumber(order)} cancelled · ${formatCredits(order.total)} refunded to ${order.buyer.fullname}`,
      })
    );
    refreshNow();
  };

  const list = (items: IOrder[], empty: string) =>
    items.length === 0 ? (
      <p className="px-4 pb-4 text-[15px] text-muted">{empty}</p>
    ) : (
      <ul className="divide-y divide-line">
        {items.map((order) => (
          <li key={order.id}>
            <BoardOrder
              order={order}
              onCancel={order.canCancel.business ? confirmCancel : null}
              cancelDisabledBy={readOnly ? reasonId : undefined}
            />
          </li>
        ))}
      </ul>
    );

  return (
    <>
      <section
        aria-labelledby={summaryHeadingId}
        className="flex flex-col gap-3 border-b border-line px-4 py-4 text-[15px]"
      >
        <h2 id={summaryHeadingId} className="sr-only">
          Today
        </h2>
        <p className="text-[17px] font-bold tabular-nums">
          {summaryText(summary)}
        </p>
        {summary.fromTweets > 0 && (
          <p className="text-muted">
            {pluralize(summary.fromTweets, "order")} from Tweets today
          </p>
        )}
        {walletOn && wallet && (
          <p className="flex flex-wrap items-center gap-x-2 tabular-nums text-muted">
            <span>
              Wallet · Available {formatAmount(wallet.available)} · Pending{" "}
              {formatAmount(wallet.pending)} credits
            </span>
            <DemoBadge />
          </p>
        )}
        <div>
          <DemoOrderButton
            business={business.username}
            reasonId={reasonId}
            onPlaced={({ order }) => {
              add([order.id]);
              refreshNow();
            }}
          />
        </div>
        {failures >= 2 && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-md border border-danger px-3 py-2 text-danger"
          >
            <span>Can’t refresh the orders right now. Retrying…</span>
            <Button size="sm" variant="outline" onClick={refreshNow}>
              Retry now
            </Button>
          </div>
        )}
      </section>

      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:divide-x lg:divide-line">
        <section
          aria-labelledby={activeHeadingId}
          className="border-b border-line lg:border-b-0"
        >
          <h2
            id={activeHeadingId}
            className="px-4 pb-1 pt-4 text-xl font-extrabold"
          >
            In progress
          </h2>
          {list(active, "Nothing in progress. New orders show up here.")}
        </section>
        <section aria-labelledby={doneHeadingId}>
          <h2
            id={doneHeadingId}
            className="px-4 pb-1 pt-4 text-xl font-extrabold"
          >
            Completed
          </h2>
          {list(done, "Delivered and cancelled orders show up here.")}
          {loadingMore && <Spinner label="Loading more orders" />}
          {cursor && !loadingMore && (
            <div className="px-4 py-4">
              <Button variant="outline" onClick={showMore}>
                Show more
              </Button>
            </div>
          )}
        </section>
      </div>

      {target && (
        <CancelOrderDialog
          order={derived.find((order) => order.id === target.id) ?? target}
          side="business"
          open={confirming}
          onClose={closeConfirm}
          onCancelled={cancelled}
        />
      )}
    </>
  );
}
