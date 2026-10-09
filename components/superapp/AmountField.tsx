import { useId, useState } from "react";

import { formatCredits, parseCredits } from "../../lib/superapp/money";
import { Cents } from "../../types/Money";

/** Why `value` is not an amount between `min` and `max`, or null if it is. */
export function amountError(
  value: string,
  min: Cents,
  max: Cents
): string | null {
  if (!value.trim()) return "Enter an amount";
  const cents = parseCredits(value);
  if (cents === null)
    return "Enter an amount like 12.50, with at most 2 decimals";
  if (cents < min) return `The minimum is ${formatCredits(min)}`;
  if (cents > max) return `The maximum is ${formatCredits(max)}`;
  return null;
}

interface AmountFieldProps {
  value: string;
  /** `cents` is null unless the text is a valid amount within the bounds. */
  onChange: (value: string, cents: Cents | null) => void;
  min: Cents;
  max: Cents;
  label?: string;
  /** An error from elsewhere (e.g. the server), shown under the field. */
  error?: string | null;
  autoFocus?: boolean;
}

/**
 * A credits amount typed as text ("12", "12.5", "12,50"): a decimal keypad
 * on phones, never a number spinner. The range is stated up front; format
 * errors show while typing, range errors once the field is left.
 */
export default function AmountField({
  value,
  onChange,
  min,
  max,
  label = "Amount in credits",
  error,
  autoFocus = false,
}: AmountFieldProps) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const own = amountError(value, min, max);
  const malformed = !!value.trim() && parseCredits(value) === null;
  const shown = error ?? (touched || malformed ? own : null);

  return (
    <div>
      <label htmlFor={id} className="block text-[15px] font-bold">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          onChange(
            next,
            amountError(next, min, max) ? null : parseCredits(next)
          );
        }}
        onBlur={() => setTouched(true)}
        aria-invalid={!!shown}
        aria-describedby={`${id}-hint${shown ? ` ${id}-error` : ""}`}
        data-autofocus={autoFocus || undefined}
        placeholder="0.00"
        className="mt-1 w-full rounded-md border border-line bg-transparent px-3 py-2 text-2xl font-bold tabular-nums placeholder:text-muted focus:border-primary focus:outline-none aria-[invalid=true]:border-danger"
      />
      <p id={`${id}-hint`} className="mt-1 text-[13px] text-muted">
        {formatCredits(min)} to {formatCredits(max)}
      </p>
      {shown && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1 text-[13px] text-danger"
        >
          {shown}
        </p>
      )}
    </div>
  );
}
