import { useId, useRef, useState } from "react";

import { errorMessage } from "../../lib/client/api";
import { formatCredits } from "../../lib/superapp/money";
import { cancelRide } from "../../slices/ridesSlice";
import { showToast } from "../../slices/uiSlice";
import { useAppDispatch } from "../../store";
import { IRide } from "../../types/Ride";
import { Button } from "../common/Button";
import Dialog from "../common/Dialog";

/**
 * "Cancel ride" until pickup, with a confirm step. Cancelling refunds the
 * whole fare and is idempotent on the server, so it takes no key. The
 * dialog stays open if pickup passes meanwhile; confirming then explains
 * why it is too late.
 */
export default function CancelRide({
  ride,
  onCancelled,
}: {
  ride: IRide;
  /** The button is gone afterwards: the page moves focus somewhere useful. */
  onCancelled: () => void;
}) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const cancelled = useRef(false);
  const errorId = useId();

  // Also the dialog's close event, which comes after the browser has put
  // focus back on the opener. After a cancel that button is gone, so the
  // page moves focus instead.
  const close = () => {
    setOpen(false);
    setError(null);
    if (cancelled.current) {
      cancelled.current = false;
      onCancelled();
    }
  };

  const confirm = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await dispatch(cancelRide(ride.id));
      cancelled.current = true;
      setOpen(false);
      dispatch(
        showToast({
          message: `Ride cancelled · ${formatCredits(ride.fare)} refunded`,
        })
      );
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      {ride.canCancel && (
        <div className="px-4 pb-4">
          <Button
            variant="outline"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
            className="min-h-11 text-danger"
          >
            Cancel ride
          </Button>
        </div>
      )}
      <Dialog open={open} onClose={close} title="Cancel this ride?">
        <div className="flex flex-col gap-4">
          <p className="text-[15px]">
            You’ll get your {formatCredits(ride.fare)} back right away.
            Cancelling is free until your driver picks you up.
          </p>
          {error && (
            <p
              id={errorId}
              role="alert"
              className="rounded-md border border-danger px-3 py-2 text-[15px] text-danger"
            >
              {error}
            </p>
          )}
          <div className="flex flex-col gap-3">
            <Button
              size="lg"
              data-autofocus
              aria-busy={busy}
              aria-disabled={busy}
              aria-describedby={error ? errorId : undefined}
              onClick={confirm}
              className="gap-2 aria-disabled:cursor-progress aria-disabled:opacity-60"
            >
              {busy && (
                <span
                  aria-hidden="true"
                  className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white"
                />
              )}
              Cancel ride and refund {formatCredits(ride.fare)}
            </Button>
            <Button variant="outline" size="lg" onClick={close}>
              Keep my ride
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
