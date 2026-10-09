import { ReactNode } from "react";

/**
 * Slot (§12.3): the orders lane's global dialogs, the quick order sheet
 * (ui.dialog "quickOrder"; arguments in ui.dialogArgs).
 * AppShell loads it on demand (next/dynamic, no SSR). This stub renders
 * nothing.
 */
const OrderDialogs: () => ReactNode = () => null;
export default OrderDialogs;
