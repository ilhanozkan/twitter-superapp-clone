import { Cents } from "../../types/Money";

// Demo credits are integers of hundredths everywhere; only these helpers
// turn them into text. There are no currency symbols anywhere, so credits
// can't be mistaken for real money. Isomorphic: used by the server and the UI.

export const CENTS_PER_CREDIT = 100;

/** The largest amount `parseCredits` accepts: 1,000,000.00 credits. */
const MAX_PARSED: Cents = 1_000_000 * CENTS_PER_CREDIT;

const MINUS = "−";

/** A safe integer >= 0. */
export function isCents(value: unknown): value is Cents {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * "1,234.50". Formatted by hand (not `toLocaleString`) so the server and every
 * browser produce the same text, whatever their locale. Negative amounts get
 * a U+2212 minus.
 */
export function formatAmount(cents: Cents): string {
  const magnitude = Math.abs(cents);
  const whole = Math.floor(magnitude / CENTS_PER_CREDIT)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = String(magnitude % CENTS_PER_CREDIT).padStart(2, "0");
  return `${cents < 0 ? MINUS : ""}${whole}.${fraction}`;
}

/**
 * "1,234.50 credits". With `sign: "always"`, gains show "+" and losses a
 * U+2212 minus; zero has no sign. `"never"` (the default) shows the magnitude.
 */
export function formatCredits(
  cents: Cents,
  { sign = "never" }: { sign?: "never" | "always" } = {}
): string {
  const prefix = sign === "always" ? (cents > 0 ? "+" : "") : "";
  const amount = formatAmount(sign === "always" ? cents : Math.abs(cents));
  return `${prefix}${amount} credits`;
}

/** Screen-reader text that never relies on a sign or a colour: "received 12.50 credits". */
export function spokenCredits(
  cents: Cents,
  direction?: "received" | "sent"
): string {
  const amount = formatCredits(Math.abs(cents));
  return direction ? `${direction} ${amount}` : amount;
}

const AMOUNT = /^(\d+)(?:[.,](\d{1,2}))?$/;

/**
 * "12" → 1200, "12.5" → 1250, "12,50" → 1250 (comma only when there is no
 * dot). Null for more than 2 decimals, signs, exponents, inner spaces, empty
 * or > 1,000,000.00. Surrounding whitespace is ignored.
 */
export function parseCredits(input: string): Cents | null {
  const text = input.trim();
  if (text.includes(".") && text.includes(",")) return null;

  const match = AMOUNT.exec(text);
  if (!match) return null;

  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const cents = whole * CENTS_PER_CREDIT + fraction;
  return Number.isSafeInteger(cents) && cents <= MAX_PARSED ? cents : null;
}
