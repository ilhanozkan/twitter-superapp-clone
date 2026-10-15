import { useId, useState } from "react";
import { HiOutlineQuestionMarkCircle } from "react-icons/hi2";

import { formatAmount } from "../../lib/superapp/money";
import { IWallet } from "../../types/Wallet";
import DemoBadge from "./DemoBadge";

/** The wallet page's balance: big tabular figures, then what is pending. */
export default function BalanceSummary({ wallet }: { wallet: IWallet }) {
  const [help, setHelp] = useState(false);
  const helpId = useId();

  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[34px] font-extrabold tabular-nums leading-10 [overflow-wrap:anywhere]">
          {formatAmount(wallet.balance)}
        </span>
        <span className="text-[15px] font-bold">credits</span>
        <DemoBadge className="self-center" />
      </p>
      {wallet.pending > 0 && (
        <>
          <p className="mt-1 flex items-center gap-1 text-[15px] text-muted">
            <span className="tabular-nums">
              Available {formatAmount(wallet.available)} · Pending{" "}
              {formatAmount(wallet.pending)}
            </span>
            <button
              type="button"
              aria-label="About pending credits"
              aria-expanded={help}
              aria-controls={helpId}
              onClick={() => setHelp((value) => !value)}
              className="rounded-full p-1 text-lg transition-colors hover:bg-fg/10"
            >
              <HiOutlineQuestionMarkCircle aria-hidden="true" />
            </button>
          </p>
          <p id={helpId} hidden={!help} className="mt-1 text-[13px] text-muted">
            Pending credits come from orders or rides that can still be
            refunded. They become available on delivery or pickup.
          </p>
        </>
      )}
    </div>
  );
}
