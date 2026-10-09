import { ReactNode } from "react";

/**
 * Slot (§12.3): the wallet lane's global dialogs, Send, Request, Add
 * credits and Tip (ui.dialog "send", "request", "topUp", "tip"; their
 * arguments are in ui.dialogArgs).
 * AppShell loads it on demand (next/dynamic, no SSR). This stub renders
 * nothing.
 */
const WalletDialogs: () => ReactNode = () => null;
export default WalletDialogs;
