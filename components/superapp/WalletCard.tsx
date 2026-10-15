import Link from "next/link";
import { useId } from "react";

import { useAppSelector } from "../../store";
import WalletActions, { WalletActionsProps } from "../wallet/WalletActions";
import DemoBadge from "./DemoBadge";
import Money from "./Money";

/**
 * The viewer's balance with the wallet's actions: in the right column and
 * on Services. Hidden while the wallet is off or could not be loaded.
 */
export default function WalletCard({
  variant,
}: {
  variant: Exclude<WalletActionsProps["variant"], "page">;
}) {
  const on = useAppSelector((state) => state.session.features.wallet);
  const wallet = useAppSelector((state) => state.wallet.wallet);
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const headingId = useId();
  if (!on || !wallet) return null;

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-2 rounded-2xl bg-subtle p-4"
    >
      <div className="flex items-center gap-2">
        <h2 id={headingId} className="text-xl font-extrabold">
          <Link href="/wallet" className="hover:underline">
            Wallet
          </Link>
        </h2>
        <DemoBadge />
      </div>
      <p className="text-2xl font-extrabold">
        <Money amount={wallet.balance} />
      </p>
      {wallet.pending > 0 && (
        <p className="text-[13px] text-muted">
          Available <Money amount={wallet.available} unit={false} /> · Pending{" "}
          <Money amount={wallet.pending} unit={false} />
        </p>
      )}
      {wallet.frozen && (
        <p className="text-[13px] font-bold text-danger">
          Frozen by a moderator
        </p>
      )}
      {/* Read-only demos show balances only. */}
      {!readOnly && <WalletActions variant={variant} />}
    </section>
  );
}
