import { LedgerView, PendingTransfer } from "../../superapp/ledger";
import { ITransfer } from "../../../types/Wallet";
import { NotImplementedError } from "../errors";

export interface MemoryLedger {
  view(): LedgerView;
  /**
   * Replay check, capacity check, prepare, plan, then apply — all
   * synchronously. NOT a Promise: no await can enter the critical section,
   * so concurrent requests serialize on Node's single thread.
   */
  commit<T>(op: {
    operationId: string;
    fingerprint: string;
    /** requestHash of the primary record if stored. */
    storedFingerprint(): string | undefined;
    replay(): T;
    prepare(view: LedgerView): {
      transfers: PendingTransfer[];
      apply(transfers: ITransfer[]): T;
    };
  }): { result: T; replayed: boolean };
}

/** The demo-credit ledger ships with the wallet; until then it refuses every operation. */
export function createMemoryLedger(): MemoryLedger {
  const refuse = (): never => {
    throw new NotImplementedError(
      "The demo-credit ledger is not available yet"
    );
  };
  return { view: refuse, commit: refuse };
}
