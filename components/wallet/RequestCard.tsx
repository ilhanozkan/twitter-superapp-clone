import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { errorMessage } from "../../lib/client/api";
import { formatAmount } from "../../lib/superapp/money";
import { showToast } from "../../slices/uiSlice";
import { closeRequest } from "../../slices/walletUiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { IPaymentRequest, PaymentRequestStatus } from "../../types/Wallet";
import Avatar from "../common/Avatar";
import { Button } from "../common/Button";
import RelativeTime from "../common/RelativeTime";
import Money from "../superapp/Money";
import { receiptPath } from "./dialogArgs";
import { useMoneyAction } from "./useMoneyAction";

export const STATUS_LABELS: Record<PaymentRequestStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
};

// Worded apart from the page's read-only banner, whose sentence shows once.
const READ_ONLY_REASON = {
  incoming: "Paying and declining are off on this read-only demo.",
  outgoing: "Cancelling is off on this read-only demo.",
};

interface RequestCardProps {
  request: IPaymentRequest;
  /** "incoming": the viewer is asked to pay; "outgoing": they asked. */
  direction: "incoming" | "outgoing";
  /** Opens the review step for paying it (incoming, pending). */
  onPay?: (request: IPaymentRequest) => void;
}

/**
 * One payment request: who asked whom for how much, the note and when,
 * its status, and what the viewer can do now: Pay or Decline what they
 * were asked, Cancel what they asked while it is pending. A request
 * answered here stays in place with its new status, so focus has
 * somewhere to go.
 */
export default function RequestCard({
  request,
  direction,
  onPay,
}: RequestCardProps) {
  const dispatch = useAppDispatch();
  const run = useMoneyAction();
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const summary = useRef<HTMLParagraphElement>(null);
  // Set when this card's own button closed it: focus moves to the summary.
  const refocus = useRef(false);
  const reasonId = useId();
  const errorId = useId();

  const incoming = direction === "incoming";
  const other = incoming ? request.requester : request.payer;
  const pending = request.status === "pending";
  const amount = formatAmount(request.amount);

  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    summary.current?.focus();
  }, [request.status]);

  const close = async (action: "decline" | "cancel") => {
    if (busy) return;
    setBusy(true);
    setError(null);
    // Set first: the new status renders before the request resolves here.
    refocus.current = true;
    try {
      await run(closeRequest(request, action));
      dispatch(
        showToast({
          message:
            action === "decline"
              ? `You declined ${other.fullname}’s request`
              : `You cancelled your request to ${other.fullname}`,
        })
      );
    } catch (reason) {
      refocus.current = false;
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const describedBy =
    [readOnly ? reasonId : null, error ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <article className="flex gap-3 border-b border-line px-4 py-3">
      <Avatar user={other} />
      <div className="min-w-0 flex-1">
        <p
          ref={summary}
          tabIndex={-1}
          data-request-summary={request.id}
          className="text-[15px] leading-5 [overflow-wrap:anywhere]"
        >
          {incoming ? (
            <>
              <Link href={`/${other.username}`} className="font-bold">
                {other.fullname}
              </Link>{" "}
              requested <Money amount={request.amount} className="font-bold" />
            </>
          ) : (
            <>
              You requested{" "}
              <Money amount={request.amount} className="font-bold" /> from{" "}
              <Link href={`/${other.username}`} className="font-bold">
                {other.fullname}
              </Link>
            </>
          )}
          {request.note && <> · {request.note}</>}
          <span className="text-muted">
            {" "}
            · <RelativeTime iso={request.createdAt} />
          </span>
        </p>

        {(!pending || !incoming) && (
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="rounded-full border border-line px-2 font-bold leading-5 text-muted">
              {STATUS_LABELS[request.status]}
            </span>
            {request.status === "paid" && request.transferId && (
              <Link
                href={receiptPath(request.transferId)}
                className="font-bold text-primary hover:underline"
              >
                View receipt
              </Link>
            )}
          </p>
        )}

        {pending && (
          <div className="mt-2 flex flex-wrap gap-2">
            {incoming && (
              <Button
                aria-label={`Pay ${amount} credits to ${other.fullname}`}
                aria-haspopup="dialog"
                aria-describedby={describedBy}
                disabled={readOnly || busy}
                onClick={() => onPay?.(request)}
                className="min-h-[44px]"
              >
                Pay {amount}
              </Button>
            )}
            <Button
              variant="outline"
              aria-label={
                incoming
                  ? `Decline ${other.fullname}’s request`
                  : `Cancel your request to ${other.fullname}`
              }
              aria-describedby={describedBy}
              aria-busy={busy}
              disabled={readOnly || busy}
              onClick={() => close(incoming ? "decline" : "cancel")}
              className="min-h-[44px]"
            >
              {incoming ? "Decline" : "Cancel"}
            </Button>
          </div>
        )}
        {pending && readOnly && (
          <p id={reasonId} className="mt-1 text-[13px] text-muted">
            {READ_ONLY_REASON[direction]}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="mt-1 text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
    </article>
  );
}
