import { useEffect, useId, useRef, useState } from "react";

import { errorMessage } from "../../lib/client/api";
import { useIdempotencyKey } from "../../lib/client/useIdempotencyKey";
import { LIMITS } from "../../lib/superapp/limits";
import { formatAmount, formatCredits } from "../../lib/superapp/money";
import { showToast } from "../../slices/uiSlice";
import { topUpCredits } from "../../slices/walletUiSlice";
import { fetchWallet } from "../../slices/walletSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { Cents } from "../../types/Money";
import { IWallet, IWalletLimits } from "../../types/Wallet";
import { Button } from "../common/Button";
import Dialog from "../common/Dialog";
import Spinner from "../common/Spinner";
import DialogProblem from "./DialogProblem";
import { receiptPath } from "./dialogArgs";
import { useMoneyAction } from "./useMoneyAction";
import { useWalletDialog } from "./useWalletDialog";

export interface TopUpOption {
  amount: Cents;
  /** Why it can't be chosen now, shown under it; null when it can. */
  reason: string | null;
}

/** The top-up amounts, each with the reason it is unavailable, if any. */
export function topUpOptions(
  wallet: IWallet | null,
  limits: IWalletLimits
): TopUpOption[] {
  return limits.topUpAmounts.map((amount) => {
    if (limits.topUpsLeftToday <= 0) {
      return { amount, reason: "Daily limit reached" };
    }
    if (wallet && wallet.balance + amount > limits.topUpCap) {
      return {
        amount,
        reason: `Over the ${formatAmount(limits.topUpCap)} cap`,
      };
    }
    return { amount, reason: null };
  });
}

/** 50.00 when it is allowed, else the largest amount that is. */
function preferred(options: TopUpOption[]): Cents | null {
  const allowed = options.filter((option) => !option.reason);
  const middle = LIMITS.topUp.amounts[1];
  if (allowed.some((option) => option.amount === middle)) return middle;
  return allowed.at(-1)?.amount ?? null;
}

function TopUpForm({
  wallet,
  limits,
  onClose,
}: {
  wallet: IWallet | null;
  limits: IWalletLimits;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const run = useMoneyAction();
  const id = useId();
  const options = topUpOptions(wallet, limits);
  const [picked, setPicked] = useState<Cents | null>(null);
  const amount = options.some((o) => o.amount === picked && !o.reason)
    ? picked
    : preferred(options);
  const { key, rotate } = useIdempotencyKey([amount]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const errorId = `${id}-error`;
  const allUsed = limits.topUpsLeftToday <= 0;

  const submit = async () => {
    if (inFlight.current || amount === null) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const transfer = await run(topUpCredits(amount, key));
      rotate();
      dispatch(
        showToast({
          message: `Added ${formatAmount(transfer.amount)} demo credits`,
          action: { label: "Receipt", href: receiptPath(transfer.id) },
        })
      );
      onClose();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px]">
        Demo credits are free and have no cash value.
      </p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[15px]">
        {wallet && (
          <>
            <dt className="text-muted">Balance</dt>
            <dd className="text-right tabular-nums">
              {formatCredits(wallet.balance)}
            </dd>
          </>
        )}
        <dt className="text-muted">Top-ups left</dt>
        <dd className="text-right tabular-nums">
          {limits.topUpsLeftToday} of {limits.topUpsPerDay} per 24 hours
        </dd>
      </dl>

      <fieldset>
        <legend className="text-[15px] font-bold">Amount in credits</legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {options.map((option) => {
            const reasonId = `${id}-${option.amount}`;
            return (
              <label
                key={option.amount}
                className={`flex min-h-[64px] flex-col items-center justify-center rounded-2xl border-2 px-1 py-2 text-center transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
                  option.reason
                    ? "cursor-not-allowed border-dashed border-line"
                    : "cursor-pointer border-line hover:bg-fg/5"
                }`}
              >
                <input
                  type="radio"
                  name={`${id}-amount`}
                  value={option.amount}
                  checked={amount === option.amount}
                  disabled={!!option.reason || busy}
                  onChange={() => setPicked(option.amount)}
                  aria-describedby={option.reason ? reasonId : undefined}
                  className="sr-only"
                />
                <span
                  className={`text-lg font-bold tabular-nums ${option.reason ? "text-muted" : ""}`}
                >
                  {formatAmount(option.amount)}
                </span>
                {option.reason && (
                  <span
                    id={reasonId}
                    className="text-[12px] leading-4 text-muted"
                  >
                    {option.reason}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </fieldset>
      {allUsed ? (
        <p className="text-[15px] text-muted">
          You’ve used all {limits.topUpsPerDay} top-ups for the last 24 hours.
          Try again later.
        </p>
      ) : (
        options.some((option) => option.reason) && (
          <p className="text-[15px] text-muted">
            Top-ups stop at a balance of {formatCredits(limits.topUpCap)}.
          </p>
        )
      )}

      {error && (
        <p
          id={errorId}
          role="alert"
          className="rounded-md border border-danger px-3 py-2 text-[15px] text-danger"
        >
          {error}
        </p>
      )}

      <Button
        size="lg"
        data-autofocus
        disabled={amount === null}
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
        {amount === null
          ? "Add demo credits"
          : `Add ${formatAmount(amount)} demo credits`}
      </Button>
      {amount === null && (
        <Button size="lg" variant="outline" onClick={onClose}>
          Close
        </Button>
      )}
    </div>
  );
}

/** The limits come with the wallet; read them when this page has none. */
function TopUpContent({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const wallet = useAppSelector((state) => state.wallet.wallet);
  const limits = useAppSelector((state) => state.wallet.limits);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (limits || failed) return;
    dispatch(fetchWallet())
      .unwrap()
      .catch(() => setFailed(true));
  }, [dispatch, limits, failed]);

  if (limits) {
    return <TopUpForm wallet={wallet} limits={limits} onClose={onClose} />;
  }
  if (failed) {
    return (
      <DialogProblem onClose={onClose}>
        Your wallet can’t be loaded right now. Try again in a moment.
      </DialogProblem>
    );
  }
  return <Spinner label="Loading your wallet" />;
}

/** Add credits: a global dialog (ui.dialog "topUp"), a bottom sheet on phones. */
export default function TopUpDialog() {
  const { open, close } = useWalletDialog("topUp");

  return (
    <Dialog open={open} onClose={close} title="Add credits" variant="sheet">
      <TopUpContent onClose={close} />
    </Dialog>
  );
}
