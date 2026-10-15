import Link from "next/link";
import { ReactNode, useEffect, useId, useRef, useState } from "react";

import { ApiRequestError, errorMessage } from "../../lib/client/api";
import { useIdempotencyKey } from "../../lib/client/useIdempotencyKey";
import { formatCredits } from "../../lib/superapp/money";
import { useAppSelector } from "../../store";
import { Cents } from "../../types/Money";
import { IAuthor } from "../../types/User";
import Avatar from "../common/Avatar";
import { Button } from "../common/Button";
import Money from "./Money";

export interface PaymentConfirmProps {
  /** The verb of the operation: "Send", "Pay", "Tip", "Request"... */
  action: string;
  /** Who gets paid; for a request, who is asked to pay. */
  payee: IAuthor;
  amount: Cents;
  /** Added to the amount, e.g. a delivery fee. */
  fee?: Cents;
  note?: string | null;
  /**
   * "request" reviews asking `payee` for credits: "Request 4.50 credits
   * from Sarah Chen". Nothing leaves the wallet, so no balance is shown or
   * checked.
   */
  kind?: "payment" | "request";
  /** What happens next, under the amounts (e.g. how a request is answered). */
  explanation?: ReactNode;
  /** What the viewer can spend; defaults to their wallet in the store. */
  available?: Cents | null;
  /**
   * Runs the operation with this Idempotency-Key and throws (an
   * ApiRequestError) if it fails. The key stays the same for every retry
   * of this review, so the server can never apply it twice.
   */
  onConfirm: (key: string) => Promise<void>;
  /** After a success, once the key is dropped. */
  onDone?: () => void;
  onBack?: () => void;
  /** Where "Add credits" leads; a link to the wallet by default. */
  onAddCredits?: () => void;
}

const insufficientMessage = (available: Cents) =>
  `You have ${formatCredits(available)} available. Add credits or lower the amount`;

/**
 * The review step of every money movement (WCAG 3.3.4): who gets paid, how
 * much, the fee, the note and what is left afterwards, with a focused
 * confirm button that repeats the amount and the payee. A payment request
 * is reviewed the same way, without the balance. Money is never
 * optimistic: the button waits for the server.
 */
export default function PaymentConfirm({
  action,
  payee,
  amount,
  fee = 0,
  note = null,
  kind = "payment",
  explanation,
  available: availableProp,
  onConfirm,
  onDone,
  onBack,
  onAddCredits,
}: PaymentConfirmProps) {
  const stored = useAppSelector((state) => state.wallet.wallet?.available);
  const request = kind === "request";
  const available = request
    ? null
    : availableProp === undefined
      ? (stored ?? null)
      : availableProp;
  const { key, rotate } = useIdempotencyKey([
    payee.username,
    amount,
    fee,
    note,
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{
    message: string;
    funds: boolean;
  } | null>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  // Two clicks in one frame both see busy=false: guard synchronously too.
  const inFlight = useRef(false);
  const errorId = useId();

  const total = amount + fee;
  const short = available !== null && total > available;
  const preposition = request ? "from" : "to";
  const label = `${action} ${formatCredits(total)} ${preposition} ${payee.fullname}`;

  useEffect(() => {
    confirm.current?.focus();
  }, []);

  const submit = async () => {
    if (inFlight.current || short) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(key);
      rotate();
      onDone?.();
    } catch (reason) {
      const funds =
        reason instanceof ApiRequestError &&
        reason.code === "insufficient_funds";
      setError({ message: errorMessage(reason), funds });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const addCredits = onAddCredits ? (
    <Button variant="outline" size="sm" onClick={onAddCredits}>
      Add credits
    </Button>
  ) : (
    <Link
      href="/wallet"
      className="font-bold text-primary underline underline-offset-2"
    >
      Add credits
    </Link>
  );

  const alert = short ? (
    <>
      <span>{insufficientMessage(available)}</span> {addCredits}
    </>
  ) : error ? (
    <>
      <span>{error.message}</span>
      {error.funds && <> {addCredits}</>}
    </>
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xl font-bold leading-7">
        {action} <Money amount={total} /> {preposition} {payee.fullname}{" "}
        <span className="font-normal text-muted">(@{payee.username})</span>
      </p>

      <div className="flex items-center gap-3">
        <Avatar user={payee} />
        <div className="min-w-0 leading-5">
          <p className="truncate font-bold">{payee.fullname}</p>
          <p className="truncate text-muted">@{payee.username}</p>
        </div>
      </div>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[15px]">
        <dt className="text-muted">Amount</dt>
        <dd className="text-right">
          <Money amount={amount} />
        </dd>
        {fee > 0 && (
          <>
            <dt className="text-muted">Fee</dt>
            <dd className="text-right">
              <Money amount={fee} />
            </dd>
            <dt className="font-bold">Total</dt>
            <dd className="text-right font-bold">
              <Money amount={total} />
            </dd>
          </>
        )}
        {note && (
          <>
            <dt className="text-muted">Note</dt>
            <dd className="text-right [overflow-wrap:anywhere]">{note}</dd>
          </>
        )}
        {available !== null && (
          <>
            <dt className="text-muted">Available</dt>
            <dd className="text-right">
              <Money amount={available} />
            </dd>
            <dt className="text-muted">Balance after</dt>
            <dd className="text-right">
              {short ? (
                "Not enough credits"
              ) : (
                <Money amount={available - total} />
              )}
            </dd>
          </>
        )}
      </dl>
      {explanation && <p className="text-[15px] text-muted">{explanation}</p>}

      {alert && (
        <p
          id={errorId}
          role="alert"
          className="rounded-md border border-danger px-3 py-2 text-[15px] text-danger"
        >
          {alert}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <Button
          ref={confirm}
          size="lg"
          data-autofocus
          aria-describedby={alert ? errorId : undefined}
          aria-disabled={busy || short}
          aria-busy={busy}
          onClick={submit}
          className="gap-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
        >
          {busy && (
            <span
              aria-hidden="true"
              className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white"
            />
          )}
          {label}
        </Button>
        {onBack && (
          <Button variant="outline" size="lg" onClick={onBack} disabled={busy}>
            Back
          </Button>
        )}
      </div>
      <p className="text-[13px] text-muted">Demo credits · no cash value</p>
    </div>
  );
}
