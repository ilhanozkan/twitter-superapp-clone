import { useAppSelector } from "../../store";
import RequestDialog from "./RequestDialog";
import SendDialog from "./SendDialog";
import TopUpDialog from "./TopUpDialog";

/**
 * Slot (§12.3): the wallet's global dialogs, Send, Request and Add credits
 * (ui.dialog "send", "request", "topUp"; their arguments are in
 * ui.dialogArgs, see dialogArgs.ts). AppShell loads this on demand
 * (next/dynamic, no SSR). Nothing renders while the wallet is off or the
 * demo is read-only: no money moves there.
 */
export default function WalletDialogs() {
  const on = useAppSelector((state) => state.session.features.wallet);
  const readOnly = useAppSelector((state) => state.session.readOnly);
  if (!on || readOnly) return null;

  return (
    <>
      <SendDialog />
      <RequestDialog />
      <TopUpDialog />
    </>
  );
}
