import { useEffect, useState } from "react";

import { ApiRequestError, request } from "../../lib/client/api";
import { useIdempotencyKey } from "../../lib/client/useIdempotencyKey";
import { LIMITS } from "../../lib/superapp/limits";
import { parseCredits } from "../../lib/superapp/money";
import { CreditsDraft } from "../../slices/walletUiSlice";
import { useAppSelector } from "../../store";
import { UserResponse } from "../../types/Api";
import { Cents } from "../../types/Money";
import { IAuthor } from "../../types/User";
import { amountError } from "../superapp/AmountField";
import { amountText, readCreditsArgs } from "./dialogArgs";

export type CreditsStep = "to" | "amount" | "review" | "done";

type Lookup =
  | { status: "ready" }
  | { status: "loading" }
  | { status: "failed"; message: string };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * The state of a Send or Request dialog: its step, the other party (looked
 * up when only a username was given), the amount and note, and the
 * Idempotency-Key of the operation they describe.
 *
 * The key belongs to the dialog rather than the review step, so it follows
 * the spec's rules: it survives Back (returning to Review unchanged replays
 * an attempt whose answer was lost instead of paying twice), changes with
 * the person, amount or note, and is rotated after a success and dropped
 * when the dialog closes (its content unmounts).
 */
export function useCreditsDraft(args: Record<string, string> | null) {
  const viewer = useAppSelector((state) => state.session.viewer?.username);
  const limits = useAppSelector((state) => state.wallet.limits);
  const min = limits?.minPayment ?? LIMITS.payment.min;
  const max = limits?.maxPayment ?? LIMITS.payment.max;

  // Read once: the dialog remounts its content when it opens again.
  const [prefill] = useState(() => readCreditsArgs(args));
  const locked = !!prefill.to;
  const [other, setOther] = useState<IAuthor | null>(prefill.other);
  const [lookup, setLookup] = useState<Lookup>(() =>
    prefill.to && !prefill.other ? { status: "loading" } : { status: "ready" }
  );
  const [step, setStep] = useState<CreditsStep>(locked ? "amount" : "to");
  const [amount, setAmount] = useState(() =>
    prefill.amount ? amountText(prefill.amount) : ""
  );
  const [note, setNote] = useState(prefill.note);

  useEffect(() => {
    if (lookup.status !== "loading" || !prefill.to) return;
    let live = true;
    request<UserResponse>(`/api/users/${encodeURIComponent(prefill.to)}`).then(
      ({ user }) => {
        if (!live) return;
        setOther({
          username: user.username,
          fullname: user.fullname,
          image: user.image,
        });
        setLookup({ status: "ready" });
      },
      (error: unknown) => {
        if (!live) return;
        setLookup({
          status: "failed",
          message:
            error instanceof ApiRequestError && error.status === 404
              ? `There's no account called @${prefill.to}.`
              : "This person can't be loaded right now. Try again in a moment.",
        });
      }
    );
    return () => {
      live = false;
    };
  }, [lookup.status, prefill.to]);

  const cents: Cents | null = amountError(amount, min, max)
    ? null
    : parseCredits(amount);
  const cleanNote = note.trim() || null;
  const { key, rotate } = useIdempotencyKey([
    other?.username.toLowerCase() ?? null,
    cents,
    cleanNote,
  ]);

  const draft: CreditsDraft | null =
    other && cents !== null ? { other, amount: cents, note: cleanNote } : null;

  return {
    step,
    setStep,
    locked,
    lookup,
    /** Opened for the viewer themselves (a profile or menu of their own). */
    isSelf: !!other && !!viewer && same(other.username, viewer),
    other,
    choose(person: IAuthor) {
      setOther(person);
      setStep("amount");
    },
    amount,
    setAmount,
    note,
    setNote,
    min,
    max,
    draft,
    key,
    rotate,
  };
}
