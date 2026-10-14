import { useId, useState } from "react";
import { RiCoinLine } from "react-icons/ri";

import { formatCredits } from "../../lib/superapp/money";
import { firstName, RIDE_TIP_PRESETS } from "../../lib/superapp/rides";
import { tipDriver } from "../../slices/ridesSlice";
import { showToast } from "../../slices/uiSlice";
import { useAppDispatch } from "../../store";
import { Cents } from "../../types/Money";
import { IRide } from "../../types/Ride";
import Dialog from "../common/Dialog";
import Money from "../superapp/Money";
import PaymentConfirm from "../superapp/PaymentConfirm";

/**
 * "Tip Ahmet" after a completed ride: 1, 2 or 5 credits, each reviewed in
 * PaymentConfirm, whose Idempotency-Key covers every retry of that review.
 */
export default function RideTip({ ride }: { ride: IRide }) {
  const dispatch = useAppDispatch();
  const [amount, setAmount] = useState<Cents | null>(null);
  const [tipped, setTipped] = useState<Cents[]>([]);
  const headingId = useId();
  const name = firstName(ride.driver.fullname);

  const confirm = async (key: string) => {
    if (amount === null) return;
    const transfer = await dispatch(tipDriver(ride.id, amount, key));
    setTipped((previous) => [...previous, amount]);
    dispatch(
      showToast({
        message: `You tipped ${name} ${formatCredits(amount)}`,
        action: {
          label: "Receipt",
          href: `/wallet/transactions/${encodeURIComponent(transfer.id)}`,
        },
      })
    );
  };

  return (
    <section
      aria-labelledby={headingId}
      className="border-t border-line px-4 py-4"
    >
      <h2 id={headingId} className="text-xl font-extrabold">
        Tip {name}
      </h2>
      <p className="mt-1 text-[15px] text-muted">
        All of it goes to your driver, from your demo credits.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {RIDE_TIP_PRESETS.map((preset) => (
          <li key={preset}>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={`Tip ${name} ${formatCredits(preset)}`}
              onClick={() => setAmount(preset)}
              className="flex min-h-11 items-center gap-1.5 rounded-full border border-line px-4 font-bold text-tip transition-colors hover:bg-tip/10"
            >
              <RiCoinLine aria-hidden="true" />
              <Money amount={preset} unit={false} />
            </button>
          </li>
        ))}
      </ul>
      {/* The toast announces each tip; this keeps the total in view. */}
      {tipped.length > 0 && (
        <p className="mt-3 text-[15px]">
          Thanks! You tipped {name}{" "}
          {formatCredits(tipped.reduce((sum, value) => sum + value, 0))}.
        </p>
      )}

      <Dialog
        open={amount !== null}
        onClose={() => setAmount(null)}
        title={`Tip ${name}`}
        variant="sheet"
      >
        {amount !== null && (
          <PaymentConfirm
            action="Tip"
            payee={ride.driver}
            amount={amount}
            onConfirm={confirm}
            onDone={() => setAmount(null)}
          />
        )}
      </Dialog>
    </section>
  );
}
