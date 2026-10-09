import { useState } from "react";

import { useIdempotencyKey } from "../../lib/client/useIdempotencyKey";
import { LIMITS } from "../../lib/superapp/limits";
import { formatCredits, parseCredits } from "../../lib/superapp/money";
import { openDialog, showToast } from "../../slices/uiSlice";
import { tipTweet } from "../../slices/walletUiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { Cents } from "../../types/Money";
import { ITweet } from "../../types/Tweet";
import Dialog from "../common/Dialog";
import { amountError } from "../superapp/AmountField";
import PaymentConfirm from "../superapp/PaymentConfirm";
import DialogProblem from "./DialogProblem";
import { receiptPath } from "./dialogArgs";
import TipAmountStep, { TipChoice } from "./TipAmountStep";
import { useMoneyAction } from "./useMoneyAction";
import { useWalletDialog } from "./useWalletDialog";

/** 2.00 when it is a preset, so the sheet opens on "Tip 2.00 credits". */
function defaultChoice(presets: readonly Cents[]): TipChoice {
  return presets.includes(200) ? 200 : (presets[0] ?? "other");
}

/** Amount & thanks → Review; a success closes the sheet. */
function TipFlow({ tweet, onClose }: { tweet: ITweet; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const run = useMoneyAction();
  const limits = useAppSelector((state) => state.wallet.limits);
  const available = useAppSelector(
    (state) => state.wallet.wallet?.available ?? null
  );
  const presets = limits?.tipPresets ?? LIMITS.tip.presets;
  const min = limits?.minTip ?? LIMITS.tip.min;
  const max = limits?.maxTip ?? LIMITS.tip.max;

  const [step, setStep] = useState<"amount" | "review">("amount");
  const [choice, setChoice] = useState<TipChoice>(() => defaultChoice(presets));
  const [other, setOther] = useState("");
  const [note, setNote] = useState("");

  const amount: Cents | null =
    choice !== "other"
      ? choice
      : amountError(other, min, max)
        ? null
        : parseCredits(other);
  const cleanNote = note.trim() || null;
  // The sheet's key, not the review's: it survives Back, so returning to an
  // unchanged review replays an attempt whose answer was lost instead of
  // tipping twice (as in Send, see useCreditsDraft).
  const { key, rotate } = useIdempotencyKey([tweet.id, amount, cleanNote]);

  if (step === "review" && amount !== null) {
    const author = tweet.author;
    return (
      <PaymentConfirm
        action="Tip"
        payee={author}
        amount={amount}
        note={cleanNote}
        onConfirm={async () => {
          const { transfer } = await run(
            tipTweet(tweet.id, { amount, note: cleanNote }, key)
          );
          dispatch(
            showToast({
              message: `You tipped @${author.username} ${formatCredits(transfer.amount)}`,
              action: { label: "Receipt", href: receiptPath(transfer.id) },
            })
          );
        }}
        onDone={() => {
          rotate();
          onClose();
        }}
        onBack={() => setStep("amount")}
        onAddCredits={() => dispatch(openDialog("topUp"))}
      />
    );
  }

  return (
    <TipAmountStep
      tweet={tweet}
      presets={presets}
      choice={choice}
      onChoiceChange={setChoice}
      other={other}
      onOtherChange={setOther}
      note={note}
      onNoteChange={setNote}
      min={min}
      max={max}
      amount={amount}
      available={available}
      onNext={() => setStep("review")}
    />
  );
}

/**
 * Tip a Tweet: a global dialog (ui.dialog "tip", `{ tweetId }`), a bottom
 * sheet on phones. The Tweet is the one in the store, so the sheet always
 * shows what the timeline does, and the tip updates both.
 */
export default function TipDialog() {
  const { open, args, close } = useWalletDialog("tip");
  const tweetId = args?.tweetId ?? null;
  const tweet = useAppSelector((state) =>
    tweetId ? state.tweets.entities[tweetId] : undefined
  );
  const own = useAppSelector(
    (state) =>
      !!tweet &&
      state.session.viewer?.username.toLowerCase() ===
        tweet.author.username.toLowerCase()
  );

  return (
    <Dialog
      open={open}
      onClose={close}
      title={tweet ? `Tip @${tweet.author.username}` : "Tip"}
      variant="sheet"
    >
      {!tweet ? (
        <DialogProblem onClose={close}>
          This Tweet isn’t available anymore.
        </DialogProblem>
      ) : own ? (
        <DialogProblem onClose={close}>
          You can’t tip your own Tweet.
        </DialogProblem>
      ) : (
        <TipFlow key={tweet.id} tweet={tweet} onClose={close} />
      )}
    </Dialog>
  );
}
