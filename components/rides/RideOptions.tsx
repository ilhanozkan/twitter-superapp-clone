import { useId } from "react";
import { RiCarLine, RiTaxiLine, RiTruckLine } from "react-icons/ri";

import { formatCredits } from "../../lib/superapp/money";
import { IRideQuote, RideType } from "../../types/Ride";
import Money from "../superapp/Money";

const ICONS = { economy: RiCarLine, comfort: RiTaxiLine, xl: RiTruckLine };

/** "3 min away · 4 seats", or why the type can't be booked. */
export function quoteDetail(quote: IRideQuote): string {
  return quote.available && quote.pickupMinutes !== null
    ? `${quote.pickupMinutes} min away · ${quote.seats} seats`
    : "No drivers nearby";
}

interface RideOptionsProps {
  quotes: IRideQuote[];
  value: RideType;
  onChange: (type: RideType) => void;
}

/**
 * The ride types as a native radio group, so arrow keys move between them
 * (skipping types with no free driver, which are disabled) and the choice
 * is announced: "Economy · 7.40 credits · 3 min away · 4 seats".
 */
export default function RideOptions({
  quotes,
  value,
  onChange,
}: RideOptionsProps) {
  const name = useId();

  return (
    <fieldset>
      <legend className="text-[15px] font-bold">Choose a ride</legend>
      <div className="mt-2 flex flex-col gap-2">
        {quotes.map((quote) => {
          const Icon = ICONS[quote.type];
          const detail = quoteDetail(quote);
          return (
            <label
              key={quote.type}
              className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl border border-line px-3 py-2 transition-colors hover:bg-fg/[0.03] has-[:disabled]:cursor-not-allowed has-[:checked]:border-primary has-[:checked]:bg-primary/[0.06] has-[:disabled]:hover:bg-transparent"
            >
              <input
                type="radio"
                name={name}
                value={quote.type}
                checked={value === quote.type}
                disabled={!quote.available}
                onChange={() => onChange(quote.type)}
                aria-label={`${quote.label} · ${formatCredits(quote.fare)} · ${detail}`}
                className="h-5 w-5 shrink-0 accent-[#1570c2]"
              />
              <Icon
                aria-hidden="true"
                className={`shrink-0 text-2xl ${quote.available ? "" : "text-muted"}`}
              />
              <span className="min-w-0 flex-1 leading-5">
                <span className="block font-bold">{quote.label}</span>
                <span
                  className={`block text-[13px] ${quote.available ? "text-muted" : "font-bold text-danger"}`}
                >
                  {detail}
                </span>
              </span>
              <Money
                amount={quote.fare}
                className={`shrink-0 font-bold ${quote.available ? "" : "text-muted line-through"}`}
              />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
