import { useEffect, useId, useRef, useState } from "react";

import { formatAmount, formatCredits } from "../../lib/superapp/money";
import { Cents } from "../../types/Money";
import { ITweet } from "../../types/Tweet";
import Avatar from "../common/Avatar";
import { Button } from "../common/Button";
import AmountField, { amountError } from "../superapp/AmountField";
import NoteField, { noteTooLong } from "./NoteField";

/** A preset amount, or "other" for one typed in. */
export type TipChoice = Cents | "other";

interface TipAmountStepProps {
  tweet: ITweet;
  presets: readonly Cents[];
  choice: TipChoice;
  onChoiceChange: (choice: TipChoice) => void;
  /** The typed amount, used while `choice` is "other". */
  other: string;
  onOtherChange: (text: string) => void;
  note: string;
  onNoteChange: (note: string) => void;
  min: Cents;
  max: Cents;
  /** The chosen amount, or null while "other" holds no valid amount. */
  amount: Cents | null;
  /** What the viewer can spend, when the wallet is loaded. */
  available: Cents | null;
  onNext: () => void;
}

const CHIP =
  "flex min-h-[44px] min-w-0 cursor-pointer items-center justify-center rounded-full border border-line px-1 text-[15px] font-bold tabular-nums transition-colors hover:bg-fg/5 has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary";

/**
 * The tip sheet's first step: the Tweet being tipped, the amount (presets
 * or Other), an optional thanks and what the viewer has available. Its
 * button leads to the review, where the tip is confirmed.
 */
export default function TipAmountStep({
  tweet,
  presets,
  choice,
  onChoiceChange,
  other,
  onOtherChange,
  note,
  onNoteChange,
  min,
  max,
  amount,
  available,
  onNext,
}: TipAmountStepProps) {
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  const noteId = `${id}-note`;
  const [submitted, setSubmitted] = useState(false);

  // Back from the review lands on the chosen amount, like opening the sheet.
  useEffect(() => {
    form.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, []);

  const submit = () => {
    setSubmitted(true);
    if (amount === null) {
      form.current?.querySelector<HTMLElement>("input[inputmode]")?.focus();
    } else if (noteTooLong(note)) {
      document.getElementById(noteId)?.focus();
    } else {
      onNext();
    }
  };

  const chip = (value: TipChoice, label: string, spoken: string) => (
    <label key={value} className={CHIP}>
      <input
        type="radio"
        name={`${id}-amount`}
        value={value}
        checked={choice === value}
        onChange={() => onChoiceChange(value)}
        data-autofocus={choice === value || undefined}
        className="sr-only"
      />
      <span aria-hidden="true">{label}</span>
      <span className="sr-only">{spoken}</span>
    </label>
  );

  return (
    <form
      ref={form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex gap-3 rounded-2xl border border-line p-3">
        <Avatar user={tweet.author} size={32} />
        <div className="min-w-0 flex-1 text-[15px] leading-5">
          <p className="flex min-w-0 gap-1">
            <span className="truncate font-bold">{tweet.author.fullname}</span>
            <span className="truncate text-muted">
              @{tweet.author.username}
            </span>
          </p>
          <p className="line-clamp-2 [overflow-wrap:anywhere]">{tweet.text}</p>
        </div>
      </div>

      <fieldset>
        <legend className="text-[15px] font-bold">Amount</legend>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {presets.map((preset) =>
            chip(preset, formatAmount(preset), formatCredits(preset))
          )}
          {chip("other", "Other", "Other amount")}
        </div>
      </fieldset>

      {choice === "other" && (
        <AmountField
          label="Other amount in credits"
          value={other}
          onChange={(text) => onOtherChange(text)}
          min={min}
          max={max}
          error={submitted ? amountError(other, min, max) : null}
        />
      )}

      <NoteField
        id={noteId}
        label="Say thanks"
        value={note}
        onChange={onNoteChange}
        placeholder="Thanks for this!"
      />

      {available !== null && (
        <p className="text-[15px] text-muted">
          From your available{" "}
          <span className="tabular-nums">{formatCredits(available)}</span>
        </p>
      )}

      <Button type="submit" size="lg">
        {amount === null ? "Tip" : `Tip ${formatCredits(amount)}`}
      </Button>
    </form>
  );
}
