import { useEffect, useId, useRef, useState } from "react";

import { parseCredits } from "../../lib/superapp/money";
import { Cents } from "../../types/Money";
import { IAuthor } from "../../types/User";
import Avatar from "../common/Avatar";
import { Button } from "../common/Button";
import AmountField, { amountError } from "../superapp/AmountField";
import { amountText } from "./dialogArgs";
import NoteField, { noteTooLong } from "./NoteField";

/** The quick amounts, in credits. */
const QUICK = [2, 5, 10, 20];

interface AmountStepProps {
  /** "To" or "From", above the other party's name. */
  relation: string;
  other: IAuthor;
  amount: string;
  onAmountChange: (text: string, cents: Cents | null) => void;
  note: string;
  onNoteChange: (note: string) => void;
  min: Cents;
  max: Cents;
  onNext: () => void;
  /** Back to choosing the person; absent when the dialog was opened for them. */
  onBack?: () => void;
}

/** How much, and an optional note: the step before the review. */
export default function AmountStep({
  relation,
  other,
  amount,
  onAmountChange,
  note,
  onNoteChange,
  min,
  max,
  onNext,
  onBack,
}: AmountStepProps) {
  const form = useRef<HTMLFormElement>(null);
  const noteId = useId();
  const [submitted, setSubmitted] = useState(false);
  const valid = !amountError(amount, min, max);
  const chosen = parseCredits(amount);

  // A step that replaces another takes focus, like the dialog's first one.
  useEffect(() => {
    form.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, []);

  const submit = () => {
    setSubmitted(true);
    if (!valid) {
      form.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (noteTooLong(note)) {
      document.getElementById(noteId)?.focus();
    } else {
      onNext();
    }
  };

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
      <div className="flex items-center gap-3">
        <Avatar user={other} />
        <div className="min-w-0 leading-5">
          <p className="text-[13px] text-muted">{relation}</p>
          <p className="truncate font-bold">{other.fullname}</p>
          <p className="truncate text-muted">@{other.username}</p>
        </div>
      </div>

      <AmountField
        value={amount}
        onChange={onAmountChange}
        min={min}
        max={max}
        error={submitted ? amountError(amount, min, max) : null}
        autoFocus
      />

      <div
        role="group"
        aria-label="Quick amounts"
        className="grid grid-cols-4 gap-2"
      >
        {QUICK.map((credits) => {
          const value = credits * 100;
          return (
            <button
              key={credits}
              type="button"
              aria-pressed={chosen === value}
              onClick={() => onAmountChange(amountText(value), value)}
              className="min-h-[44px] rounded-full border border-line text-[15px] font-bold tabular-nums transition-colors hover:bg-fg/5 aria-pressed:border-primary aria-pressed:bg-primary/10"
            >
              {credits}
              <span className="sr-only"> credits</span>
            </button>
          );
        })}
      </div>

      <NoteField
        id={noteId}
        label="Note"
        value={note}
        onChange={onNoteChange}
        placeholder="What's it for?"
      />

      <div className="flex flex-col gap-3">
        <Button type="submit" size="lg">
          Review
        </Button>
        {onBack && (
          <Button variant="outline" size="lg" onClick={onBack}>
            Back
          </Button>
        )}
      </div>
    </form>
  );
}
