import { useEffect, useId, useRef, useState } from "react";

import { useServerClock } from "../../lib/client/useServerClock";
import { usePolling } from "../../lib/client/usePolling";
import { formatCredits } from "../../lib/superapp/money";
import { orderAt } from "../../lib/superapp/orders";
import {
  latestEntry,
  OrderEntry,
  refreshOrder,
} from "../../slices/ordersSlice";
import { openCompose, showToast } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { OrderStatus } from "../../types/Order";
import { IPlace } from "../../types/Superapp";
import { Button, ButtonLink } from "../common/Button";
import { useBottomScrollPadding } from "../shop/useBottomScrollPadding";
import LocalTime from "../superapp/LocalTime";
import StageList from "../superapp/StageList";
import CancelOrderDialog from "./CancelOrderDialog";
import {
  cancelledText,
  inProgress,
  orderNumber,
  statusLabel,
  statusText,
  tweetAboutIt,
} from "./format";
import OrderReceipt from "./OrderReceipt";
import ProgressLine from "./ProgressLine";
import { useOrderAgain } from "./useOrderAgain";
import { useServerTime } from "./useServerTime";

/** While on its way: the server is asked every 5 s, and right after each change. */
export const POLL_MS = 5_000;
/** The stages and the courier move between polls on the server's clock. */
const TICK_MS = 1_000;
const AFTER_CHANGE_MS = 500;

/**
 * Status changes the shell's live activity announcer reads out itself while
 * the order is in the viewer's live activity ("Order from Kızılay Kahve:
 * On the way"), even on this page. The page leaves those to it, so each is
 * heard once. A stopgap: once the shell skips an item on its own page (a
 * requested foundation change), this goes and the page says every stage.
 */
const SHELL_ANNOUNCES: ReadonlySet<OrderStatus> = new Set([
  "accepted",
  "on_the_way",
]);

const focusLost = () =>
  !document.activeElement || document.activeElement === document.body;

/**
 * An order's page (§4.8): the headline, the courier's progress line, the
 * stages (an <ol> with aria-current="step"), the receipt, and what can be
 * done now: cancel (the buyer until it is accepted, the business until it
 * is delivered), message the business, and after delivery Order again
 * and Tweet about it. It polls every 5 s and at each change while the
 * order is on its way (paused while the tab is hidden), re-derives stages
 * every second on the server's clock, and announces status changes, each
 * once, in a polite live region.
 */
export default function OrderTracker({
  initial,
  from,
  side,
}: {
  /** The order as the page read it. */
  initial: OrderEntry;
  /** The business's place, where the courier starts (null if it is gone). */
  from: IPlace | null;
  /** The viewer's side: the buyer, or someone who runs the business. */
  side: "buyer" | "business";
}) {
  const dispatch = useAppDispatch();
  const features = useAppSelector((state) => state.session.features);
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const entry = useAppSelector((state) => latestEntry(state, initial));
  const id = initial.order.id;
  const inShellActivity = useAppSelector((state) =>
    state.activity.live.some((item) => item.kind === "order" && item.id === id)
  );
  // As the server last said: once settled, nothing changes by itself.
  const settled = !inProgress(entry.order);
  const now = useServerTime(entry.serverNow, TICK_MS, !settled);
  const clock = useServerClock(entry.serverNow);
  const order = orderAt(entry.order, new Date(now));
  const { orderAgain, prompt } = useOrderAgain();

  const [cancelling, setCancelling] = useState(false);
  const [cancelledHere, setCancelledHere] = useState(false);
  const headline = useRef<HTMLHeadingElement>(null);
  const [bar, setBar] = useState<HTMLDivElement | null>(null);
  useBottomScrollPadding(bar);
  const stagesHeadingId = useId();

  const { failures, refreshNow } = usePolling(
    () => dispatch(refreshOrder(id)),
    { interval: POLL_MS, enabled: !settled }
  );

  // Ask again just after the next stage is due, rather than up to 5 s late.
  // Read from the server's copy, which changes only when a poll answers:
  // the copy re-derived every second changes on the tick that passes the
  // stage, and would cancel this timer if it came less than 500 ms after.
  const nextChange = settled ? null : entry.order.nextChangeAt;
  useEffect(() => {
    if (!nextChange) return;
    const wait = Date.parse(nextChange) - clock.now().getTime();
    const timer = setTimeout(refreshNow, Math.max(0, wait) + AFTER_CHANGE_MS);
    return () => clearTimeout(timer);
  }, [nextChange, clock, refreshNow]);

  // Status changes only, each once: the poll and the clock both see a
  // stage arrive. A cancel made here (the dialog is still open when it
  // lands) is said by the toast and the headline taking focus instead.
  const [said, setSaid] = useState({ status: order.status, text: "" });
  if (said.status !== order.status) {
    const quiet =
      (inShellActivity && SHELL_ANNOUNCES.has(order.status)) ||
      (order.status === "cancelled" && (cancelling || cancelledHere));
    setSaid({
      status: order.status,
      text: quiet ? said.text : statusText(order, side),
    });
  }

  const canCancel =
    !readOnly &&
    (side === "buyer" ? order.canCancel.buyer : order.canCancel.business);
  // The window closed under a focused Cancel button, which is gone: keep
  // focus on the page, by the news.
  const couldCancel = useRef(canCancel);
  useEffect(() => {
    const could = couldCancel.current;
    couldCancel.current = canCancel;
    if (could && !canCancel && focusLost()) {
      headline.current?.focus({ preventScroll: true });
    }
  }, [canCancel]);

  // After the dialog closes the browser returns focus to what opened it,
  // which may be gone by then (the window closed, or it worked).
  const closeDialog = () => {
    setCancelling(false);
    setTimeout(() => {
      if (focusLost()) headline.current?.focus({ preventScroll: true });
    }, 0);
  };

  const delivered = order.status === "delivered";
  const buyer = side === "buyer";
  const actions = [
    canCancel && (
      <Button
        key="cancel"
        variant="outline"
        onClick={() => setCancelling(true)}
      >
        {buyer ? "Cancel order" : "Cancel & refund"}
      </Button>
    ),
    buyer && delivered && (
      <Button key="again" onClick={() => orderAgain(order)}>
        Order again
      </Button>
    ),
    buyer && delivered && !readOnly && (
      <Button
        key="tweet"
        variant="outline"
        onClick={() => dispatch(openCompose(tweetAboutIt(order)))}
      >
        Tweet about it
      </Button>
    ),
    buyer && features.messages && (
      <ButtonLink
        key="message"
        variant="outline"
        href={`/messages?to=${encodeURIComponent(order.business.username)}`}
      >
        Message {order.business.fullname}
      </ButtonLink>
    ),
  ].filter(Boolean);

  return (
    <>
      <section className="border-b border-line">
        <div className="px-4 pt-4">
          <h2
            ref={headline}
            tabIndex={-1}
            className="text-[23px] font-extrabold leading-7 focus:outline-none"
          >
            {order.status === "delivered" ? (
              <>
                Delivered at <LocalTime iso={order.deliverAt} />
              </>
            ) : order.status === "cancelled" ? (
              cancelledText(order, side)
            ) : (
              <>
                {statusLabel(order)} · Arrives around{" "}
                <LocalTime iso={order.deliverAt} />
              </>
            )}
          </h2>
          <p className="mt-1 text-[15px] text-muted">
            {order.status === "cancelled"
              ? `${formatCredits(order.total)} refunded to ${buyer ? "your wallet" : order.buyer.fullname}`
              : buyer
                ? `${order.business.fullname} · ${order.deliveryPlace.name}`
                : `${order.placedBy === "demo_bot" ? "Demo bot · " : ""}${order.buyer.fullname} · ${order.deliveryPlace.name}`}
          </p>
        </div>
        <ProgressLine order={order} from={from} now={now} />
        <p aria-live="polite" className="sr-only">
          {said.text}
        </p>
        {failures >= 2 && (
          <p role="status" className="px-4 pb-3 text-[13px] text-muted">
            Can’t reach the server to update this order. Retrying…
          </p>
        )}
      </section>

      <section
        aria-labelledby={stagesHeadingId}
        className="border-b border-line px-4 py-4"
      >
        <h2 id={stagesHeadingId} className="mb-3 text-xl font-extrabold">
          Progress
        </h2>
        <StageList stages={order.stages} />
      </section>

      <OrderReceipt order={order} showPayments={buyer && features.wallet} />

      {actions.length > 0 && (
        <div
          ref={setBar}
          className="sticky bottom-[calc(53px+env(safe-area-inset-bottom))] z-10 flex flex-wrap gap-2 border-t border-line bg-surface px-4 py-3 xs:bottom-0"
        >
          {actions}
        </div>
      )}

      <CancelOrderDialog
        order={order}
        side={side}
        open={cancelling}
        onClose={closeDialog}
        onCancelled={({ order: cancelled }) => {
          setCancelledHere(true);
          closeDialog();
          dispatch(
            showToast({
              message: `Order ${orderNumber(cancelled)} cancelled · ${formatCredits(cancelled.total)} refunded`,
            })
          );
        }}
      />
      {prompt}
    </>
  );
}
