import { ReactNode } from "react";

export interface WalletActionsProps {
  /**
   * Where the buttons sit: the wallet page's balance card (Send, Request,
   * Add credits), the Services wallet card (the same three), or the right
   * column's card (Send, Add).
   */
  variant: "page" | "services" | "sidebar";
}

/**
 * Slot (§12.3): the wallet's action buttons. Owned by the wallet lane; this
 * stub renders nothing (the foundation shows balances only).
 */
const WalletActions: (props: WalletActionsProps) => ReactNode = () => null;
export default WalletActions;
