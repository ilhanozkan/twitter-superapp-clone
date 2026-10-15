import {
  isHeld,
  LedgerView,
  PendingTransfer,
  planLedger,
  toTransfer,
} from "../../superapp/ledger";
import { Cents } from "../../../types/Money";
import { ITransfer } from "../../../types/Wallet";
import { IdempotencyKeyReusedError, LimitExceededError } from "../errors";
import type { StoredTransfer, WalletMemoryState } from "./wallet";

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

const key = (username: string) => username.toLowerCase();

/** A stored transfer as the API sees it (no requestHash), detached from the state. */
export function publicTransfer({
  requestHash,
  ...transfer
}: StoredTransfer): ITransfer {
  void requestHash;
  return {
    ...toTransfer(transfer, transfer.createdAt),
    reversedBy: transfer.reversedBy,
  };
}

/** Σ unreversed held credits to `username` at `now`. */
export function pendingOf(
  state: WalletMemoryState,
  username: string,
  now: Date
): Cents {
  let pending = 0;
  state.transfers.forEach((transfer) => {
    if (key(transfer.to.username) === key(username) && isHeld(transfer, now))
      pending += transfer.amount;
  });
  return pending;
}

/** The ledger over `state.wallet`, reading time from `now`. */
export function createMemoryLedger(
  state: WalletMemoryState,
  { now, capacity }: { now: () => Date; capacity: number }
): MemoryLedger {
  const view = (): LedgerView => {
    const at = now();
    return {
      now: at,
      wallet: (username) => ({
        exists: state.balances.has(key(username)),
        balance: state.balances.get(key(username)) ?? 0,
        pending: pendingOf(state, username, at),
        frozen: state.frozen.has(key(username)),
      }),
      transfer: (id) => {
        const stored = state.transfers.get(id);
        return stored ? publicTransfer(stored) : null;
      },
    };
  };

  return {
    view,

    commit(op) {
      const stored = op.storedFingerprint();
      if (stored !== undefined) {
        if (stored !== op.fingerprint) throw new IdempotencyKeyReusedError();
        return { result: op.replay(), replayed: true };
      }

      // Every throw happens before the first write below.
      const current = view();
      const { transfers, apply } = op.prepare(current);
      if (state.transfers.size + transfers.length > capacity) {
        throw new LimitExceededError(
          "The demo ledger is full; restart the server"
        );
      }
      for (const transfer of transfers) {
        if (state.transfers.has(transfer.id)) {
          throw new Error(`Transfer "${transfer.id}" already exists`);
        }
      }
      const plan = planLedger(current, transfers);

      const createdAt = current.now.toISOString();
      plan.balances.forEach((balance, username) =>
        state.balances.set(username, balance)
      );
      for (const transfer of transfers) {
        state.transfers.set(transfer.id, {
          ...toTransfer(transfer, createdAt),
          requestHash: transfer.id === op.operationId ? op.fingerprint : null,
        });
      }
      for (const { originalId, refundId } of plan.reversals) {
        state.transfers.get(originalId)!.reversedBy = refundId;
      }
      return {
        result: apply(transfers.map((t) => toTransfer(t, createdAt))),
        replayed: false,
      };
    },
  };
}
