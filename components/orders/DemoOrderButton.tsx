import { useRef, useState } from "react";
import { HiOutlineSparkles } from "react-icons/hi2";

import { errorMessage } from "../../lib/client/api";
import { useIdempotencyKey } from "../../lib/client/useIdempotencyKey";
import { OrderEntry, simulateOrder } from "../../slices/ordersSlice";
import { showToast } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { Button } from "../common/Button";
import { orderNumber } from "./format";

/**
 * "Simulate a customer order · Demo bot" (§4.7): the demo customer orders
 * from the business, paid with credits issued for it in the same commit,
 * so the board stays demoable without anyone's real balance. One key per
 * simulated order: a retry after a lost answer replays it.
 */
export default function DemoOrderButton({
  business,
  onPlaced,
  reasonId,
}: {
  business: string;
  onPlaced: (entry: OrderEntry) => void;
  /** Why it is disabled on a read-only demo. */
  reasonId?: string;
}) {
  const dispatch = useAppDispatch();
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const { key, rotate } = useIdempotencyKey([business]);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const simulate = async () => {
    if (inFlight.current || readOnly) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const entry = await dispatch(simulateOrder(business, key));
      rotate();
      onPlaced(entry);
      dispatch(
        showToast({
          message: `Demo bot placed order ${orderNumber(entry.order)}`,
        })
      );
    } catch (reason) {
      dispatch(showToast({ message: errorMessage(reason), tone: "error" }));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      aria-busy={busy}
      aria-disabled={busy || readOnly || undefined}
      aria-describedby={readOnly ? reasonId : undefined}
      onClick={simulate}
      className="gap-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
    >
      {busy ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
        />
      ) : (
        <HiOutlineSparkles aria-hidden="true" className="shrink-0 text-lg" />
      )}
      Simulate a customer order · Demo bot
    </Button>
  );
}
