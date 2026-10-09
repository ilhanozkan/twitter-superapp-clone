import { Cents } from "../../types/Money";
import { IAuthor } from "../../types/User";
import { ITransfer, TransferContext, TransferKind } from "../../types/Wallet";

// The ledger's shared vocabulary. Both stores plan every money movement
// against a LedgerView and write the planned transfers atomically.

/** A transfer an operation is about to write. */
export interface PendingTransfer {
  id: string;
  kind: TransferKind;
  from: IAuthor | null;
  to: IAuthor;
  amount: Cents;
  note: string | null;
  context: TransferContext | null;
  holdUntil: string | null;
  reverses: string | null;
}

/** What a plan may read: wallets by username, and the originals named by `reverses`. */
export interface LedgerView {
  now: Date;
  wallet(username: string): {
    exists: boolean;
    balance: Cents;
    pending: Cents;
    frozen: boolean;
  };
  transfer(id: string): ITransfer | null;
}
