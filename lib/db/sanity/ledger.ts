import { LedgerView, PendingTransfer } from "../../superapp/ledger";
import { ITransfer } from "../../../types/Wallet";
import { NotImplementedError } from "../errors";

export interface SanityDoc {
  _id: string;
  _type: string;
  [field: string]: unknown;
}

export type SanityMutation =
  | { create: SanityDoc }
  | { createIfNotExists: SanityDoc }
  | { createOrReplace: SanityDoc }
  | { delete: { id: string } }
  | {
      patch: {
        id: string;
        ifRevisionID?: string;
        set?: Record<string, unknown>;
        setIfMissing?: Record<string, unknown>;
        unset?: string[];
        inc?: Record<string, number>;
        dec?: Record<string, number>;
      };
    };

export interface LedgerSnapshot extends LedgerView {
  /** _rev of the wallet doc, null when missing. */
  rev(walletUsername: string): string | null;
  originalRev(transferId: string): string | null;
  /** Extra counts the op asked for (topUps24h, pendingRequests, activeRides…). */
  counts: Record<string, number>;
}

export interface SanityLedger {
  commit<T>(op: {
    operationId: string;
    fingerprint: string;
    primaryType: string;
    /** Usernames whose wallets to load (debits, guarded credits, locks). */
    parties: string[];
    /** Transfer ids to load with _rev. */
    reverses?: string[];
    /** Read in the SAME snapshot query. */
    counts?: Record<string, { query: string; params: Record<string, unknown> }>;
    /** Usernames to revision-lock even without a debit. */
    locks?: string[];
    replay(): Promise<T>;
    /** Re-run on every attempt. Reads feature state (with _rev) and may throw domain errors. */
    prepare(snapshot: LedgerSnapshot): Promise<{
      transfers: PendingTransfer[];
      /** Credits that must be revision-guarded (top-up cap). */
      cappedCredits?: string[];
      /** Feature creates and guarded patches. */
      mutations?(transfers: ITransfer[]): SanityMutation[];
      result(transfers: ITransfer[]): T | Promise<T>;
    }>;
  }): Promise<{ result: T; replayed: boolean }>;
}

/** The demo-credit ledger ships with the wallet; until then it refuses every operation. */
export function createSanityLedger(): SanityLedger {
  return {
    async commit() {
      throw new NotImplementedError(
        "The demo-credit ledger is not available yet"
      );
    },
  };
}
