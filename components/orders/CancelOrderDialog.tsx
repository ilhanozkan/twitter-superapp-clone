import { useId, useRef, useState } from "react";

import { ApiRequestError, errorMessage } from "../../lib/client/api";
import { formatCredits } from "../../lib/superapp/money";
import {
  cancelOrder,
  OrderEntry,
  refreshOrder,
} from "../../slices/ordersSlice";
import { useAppDispatch } from "../../store";
import { IOrder } from "../../types/Order";
import { Button } from "../common/Button";
import Dialog from "../common/Dialog";
import { orderNumber } from "./format";

/**
 * "Cancel order" (the buyer, before the business accepts) or "Cancel &
 * refund" (the business, until delivery), behind a confirmation that says
 * who gets how much back. Cancelling is idempotent and takes no key; the
 * refund is the held payment reversed, so it can't fail for lack of funds.
 */
export default function CancelOrderDialog({
  order,
  side,
  open,
  onClose,
  onCancelled,
}: {
  order: IOrder;
  side: "buyer" | "business";
  open: boolean;
  onClose: () => void;
  onCancelled: (entry: OrderEntry) => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={side === "buyer" ? "Cancel this order?" : "Cancel and refund?"}
      className="max-w-sm"
    >
      {open && (
        <Confirm
          order={order}
          side={side}
          onClose={onClose}
          onCancelled={onCancelled}
        />
      )}
    </Dialog>
  );
}

function Confirm({
  order,
  side,
  onClose,
  onCancelled,
}: {
  order: IOrder;
  side: "buyer" | "business";
  onClose: () => void;
  onCancelled: (entry: OrderEntry) => void;
}) {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const errorId = useId();
  const refund = formatCredits(order.total);

  const confirm = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      onCancelled(await dispatch(cancelOrder(order.id, side)));
    } catch (reason) {
      setError(errorMessage(reason));
      // Too late (accepted or delivered meanwhile): show the order as it is.
      if (
        reason instanceof ApiRequestError &&
        reason.code === "invalid_state"
      ) {
        dispatch(refreshOrder(order.id)).catch(() => {});
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 text-[15px]">
      <p>
        {side === "buyer"
          ? `Order ${orderNumber(order)} from ${order.business.fullname}. You get ${refund} back in full.`
          : `${order.buyer.fullname} gets ${refund} back for order ${orderNumber(order)}.`}
      </p>
      {error && (
        <p
          id={errorId}
          role="alert"
          className="rounded-md border border-danger px-3 py-2 text-danger"
        >
          {error}
        </p>
      )}
      <div className="flex flex-col gap-3">
        <Button
          size="lg"
          aria-busy={busy}
          aria-disabled={busy || undefined}
          aria-describedby={error ? errorId : undefined}
          onClick={confirm}
          className="gap-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
        >
          {busy && (
            <span
              aria-hidden="true"
              className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white"
            />
          )}
          {side === "buyer" ? "Cancel order" : `Cancel & refund ${refund}`}
        </Button>
        <Button variant="outline" size="lg" onClick={onClose} disabled={busy}>
          Keep order
        </Button>
      </div>
    </div>
  );
}
