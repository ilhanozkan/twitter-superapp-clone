import { FormEvent, useEffect, useId, useRef, useState } from "react";

import { errorMessage } from "../../lib/client/api";
import { useIdempotencyKey } from "../../lib/client/useIdempotencyKey";
import { textLength } from "../../lib/constants";
import { LIMITS } from "../../lib/superapp/limits";
import { CENTS_PER_CREDIT, formatCredits } from "../../lib/superapp/money";
import { sendChatPayment, sendChatRequest } from "../../slices/messagesSlice";
import { showToast } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { Cents } from "../../types/Money";
import { IAuthor } from "../../types/User";
import Avatar from "../common/Avatar";
import { Button } from "../common/Button";
import Dialog from "../common/Dialog";
import AmountField from "../superapp/AmountField";
import Money from "../superapp/Money";
import PaymentConfirm from "../superapp/PaymentConfirm";
import { ChatMoneyMode } from "./ChatComposer";

interface ChatMoneySheetProps {
  /** Which sheet is open; null when closed. */
  mode: ChatMoneyMode | null;
  other: IAuthor;
  conversationId: string;
  /** While the conversation is a draft, its first message opens it. */
  openWith?: string;
  onClose: () => void;
}

const QUICK_AMOUNTS: Cents[] = [2, 5, 10, 20].map(
  (credits) => credits * CENTS_PER_CREDIT
);

function Person({ user }: { user: IAuthor }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar user={user} />
      <div className="min-w-0 leading-5">
        <p className="truncate font-bold">{user.fullname}</p>
        <p className="truncate text-muted">@{user.username}</p>
      </div>
    </div>
  );
}

/**
 * The review step of a request (WCAG 3.3.4), in PaymentConfirm's pattern:
 * PaymentConfirm words everything "<action> X to <payee>" and checks the
 * viewer's balance, while a request reads "Request X from <payer>" and
 * spends nothing.
 */
function RequestReview({
  payer,
  amount,
  note,
  onConfirm,
  onBack,
}: {
  payer: IAuthor;
  amount: Cents;
  note: string | null;
  onConfirm: () => Promise<void>;
  onBack: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = useRef<HTMLButtonElement>(null);
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
      <Person user={payer} />
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
        {payer.fullname} can pay or decline it in this conversation. Nothing
        leaves your wallet.
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

function MoneyFlow({
  mode,
  other,
  conversationId,
  openWith,
  onClose,
}: Omit<ChatMoneySheetProps, "mode"> & { mode: ChatMoneyMode }) {
  const dispatch = useAppDispatch();
  const available = useAppSelector((state) => state.wallet.wallet?.available);
  const [step, setStep] = useState<"amount" | "review">("amount");
  const [value, setValue] = useState("");
  const [cents, setCents] = useState<Cents | null>(null);
  const [noteText, setNoteText] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const sentTransfer = useRef<string | null>(null);
  const noteId = useId();
  const note = noteText.trim() || null;
  const noteTooLong = textLength(noteText.trim()) > LIMITS.noteMax;
  // Kept here, not in PaymentConfirm (which remounts on every Review), so
  // Back and Review again with nothing changed retries the same operation.
  const { key, rotate } = useIdempotencyKey([mode, cents, note]);
  const { min, max } = LIMITS.payment;

  // Back from the review: to the amount, where the change would be made.
  const back = () => {
    setStep("amount");
    requestAnimationFrame(() =>
      form.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus()
    );
  };

  const review = (event: FormEvent) => {
    event.preventDefault();
    if (cents !== null && !noteTooLong) setStep("review");
  };

  if (step === "review" && cents !== null) {
    const args = { conversationId, amount: cents, note, key, openWith };
    if (mode === "request") {
      return (
        <RequestReview
          payer={other}
          amount={cents}
          note={note}
          onBack={back}
          onConfirm={async () => {
            await dispatch(sendChatRequest(args));
            rotate();
            onClose();
            dispatch(
              showToast({
                message: `Request sent. You’ll get a notification when ${other.fullname} pays.`,
              })
            );
          }}
        />
      );
    }
    return (
      <PaymentConfirm
        action="Send"
        payee={other}
        amount={cents}
        note={note}
        onBack={back}
        onConfirm={async () => {
          const { transfer } = await dispatch(sendChatPayment(args));
          sentTransfer.current = transfer.id;
        }}
        onDone={() => {
          const transferId = sentTransfer.current;
          rotate();
          onClose();
          dispatch(
            showToast({
              message: `You sent ${other.fullname} ${formatCredits(cents)}`,
              ...(transferId && {
                action: {
                  label: "Receipt",
                  href: `/wallet/transactions/${encodeURIComponent(transferId)}`,
                },
              }),
            })
          );
        }}
      />
    );
  }

  return (
    <form ref={form} onSubmit={review} className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-[15px] text-muted">
          {mode === "send" ? "To" : "From"}
        </p>
        <Person user={other} />
      </div>
      <AmountField
        value={value}
        min={min}
        max={max}
        autoFocus
        onChange={(next, parsed) => {
          setValue(next);
          setCents(parsed);
        }}
      />
      <div
        role="group"
        aria-label="Quick amounts"
        className="flex flex-wrap gap-2"
      >
        {QUICK_AMOUNTS.map((amount) => (
          <button
            key={amount}
            type="button"
            aria-pressed={cents === amount}
            onClick={() => {
              setValue((amount / CENTS_PER_CREDIT).toFixed(2));
              setCents(amount);
            }}
            // Filled when picked: primary text on a primary tint is 4.45:1
            // in the light theme, white on the fill is 5.1:1 in both.
            className="min-h-11 rounded-full border border-line px-4 text-[15px] font-bold tabular-nums transition-colors hover:bg-fg/5 aria-pressed:border-primary-fill aria-pressed:bg-primary-fill aria-pressed:text-white aria-pressed:hover:bg-primary-fill-hover"
          >
            {(amount / CENTS_PER_CREDIT).toFixed(2)}
          </button>
        ))}
      </div>
      <div>
        <label htmlFor={noteId} className="block text-[15px] font-bold">
          Note <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id={noteId}
          type="text"
          autoComplete="off"
          value={noteText}
          onChange={(event) => setNoteText(event.target.value)}
          aria-invalid={noteTooLong}
          aria-describedby={`${noteId}-hint`}
          placeholder={mode === "send" ? "What's it for?" : "Coffee ☕"}
          className="mt-1 w-full rounded-md border border-line bg-transparent px-3 py-2 text-[15px] placeholder:text-muted focus:border-primary focus:outline-none aria-[invalid=true]:border-danger"
        />
        <p
          id={`${noteId}-hint`}
          className={`mt-1 text-[13px] ${noteTooLong ? "text-danger" : "text-muted"}`}
        >
          Up to {LIMITS.noteMax} characters
          {noteTooLong ? ". Shorten the note to continue." : ""}
        </p>
      </div>
      {mode === "send" && available !== undefined && (
        <p className="text-[15px] text-muted">
          From your available <Money amount={available} />
        </p>
      )}
      <Button type="submit" size="lg" disabled={cents === null || noteTooLong}>
        Review
      </Button>
    </form>
  );
}

/**
 * Send or request credits inside a conversation (a bottom sheet on
 * phones): amount and note, then the review. Nothing moves until the
 * server confirms, and the payment or request then shows in the chat.
 */
export default function ChatMoneySheet({
  mode,
  ...props
}: ChatMoneySheetProps) {
  return (
    <Dialog
      open={mode !== null}
      onClose={props.onClose}
      title={mode === "request" ? "Request credits" : "Send credits"}
      variant="sheet"
    >
      {mode && <MoneyFlow key={mode} mode={mode} {...props} />}
    </Dialog>
  );
}
