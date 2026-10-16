import { useEffect, useId, useRef, useState } from "react";

import { errorMessage } from "../../lib/client/api";
import { LIMITS } from "../../lib/superapp/limits";
import { formatCredits } from "../../lib/superapp/money";
import { Cents } from "../../types/Money";
import { IAuthor } from "../../types/User";
import Avatar from "../common/Avatar";
import { Button } from "../common/Button";
import Money from "../superapp/Money";

/**
 * The review step of a payment request, like PaymentConfirm (WCAG 3.3.4):
 * who is asked, how much and the note, with a focused confirm that repeats
 * them. Nothing leaves the wallet, so there is no balance to check; the
 * button still waits for the server.
 */
export default function RequestConfirm({
  payer,
  amount,
  note,
  onConfirm,
  onDone,
  onBack,
}: {
  payer: IAuthor;
  amount: Cents;
  note: string | null;
  /** Sends the request (the caller keeps its Idempotency-Key); throws on failure. */
  onConfirm: () => Promise<void>;
  onDone: () => void;
  onBack: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  // Two clicks in one frame both see busy=false: guard synchronously too.
  const inFlight = useRef(false);
  const errorId = useId();
  const label = `Request ${formatCredits(amount)} from ${payer.fullname}`;

  useEffect(() => {
    confirm.current?.focus();
  }, []);

  const submit = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onDone();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xl font-bold leading-7">
        Request <Money amount={amount} /> from {payer.fullname}{" "}
        <span className="font-normal text-muted">(@{payer.username})</span>
      </p>

      <div className="flex items-center gap-3">
        <Avatar user={payer} />
        <div className="min-w-0 leading-5">
          <p className="truncate font-bold">{payer.fullname}</p>
          <p className="truncate text-muted">@{payer.username}</p>
        </div>
      </div>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[15px]">
        <dt className="text-muted">Amount</dt>
        <dd className="text-right">
          <Money amount={amount} />
        </dd>
        {note && (
          <>
            <dt className="text-muted">Note</dt>
            <dd className="text-right [overflow-wrap:anywhere]">{note}</dd>
          </>
        )}
      </dl>
      <p className="text-[15px] text-muted">
        {payer.fullname} gets a notification and can pay or decline. Requests
        expire after {LIMITS.request.lifetimeDays} days.
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
          ref={confirm}
          size="lg"
          data-autofocus
          aria-describedby={error ? errorId : undefined}
          aria-disabled={busy}
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
        <Button variant="outline" size="lg" onClick={onBack} disabled={busy}>
          Back
        </Button>
      </div>
      <p className="text-[13px] text-muted">Demo credits · no cash value</p>
    </div>
  );
}
