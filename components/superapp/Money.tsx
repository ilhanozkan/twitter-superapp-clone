import {
  formatAmount,
  formatCredits,
  spokenCredits,
} from "../../lib/superapp/money";
import { Cents } from "../../types/Money";

interface MoneyProps {
  amount: Cents;
  /**
   * From the viewer's side: "received" shows "+12.50" in the success colour,
   * "sent" shows "−12.50". Screen readers hear "received 12.50 credits", so
   * neither the sign nor the colour is the only cue.
   */
  direction?: "received" | "sent";
  /** Append "credits" (the default); turn off where a label already says it. */
  unit?: boolean;
  className?: string;
}

/** An amount of demo credits as text, with tabular figures. */
export default function Money({
  amount,
  direction,
  unit = true,
  className = "",
}: MoneyProps) {
  const magnitude = Math.abs(amount);
  const text = unit ? formatCredits(magnitude) : formatAmount(magnitude);
  const classes = `tabular-nums ${direction === "received" ? "text-success" : ""} ${className}`;

  if (!direction) return <span className={classes}>{text}</span>;
  return (
    <span className={classes}>
      <span aria-hidden="true">
        {direction === "received" ? "+" : "−"}
        {text}
      </span>
      <span className="sr-only">{spokenCredits(magnitude, direction)}</span>
    </span>
  );
}
