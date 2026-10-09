import { Cents } from "../../types/Money";
import { IAuthor } from "../../types/User";
import {
  ITransfer,
  LedgerAudit,
  TransferContext,
  TransferKind,
} from "../../types/Wallet";
import {
  InsufficientFundsError,
  InvalidStateError,
  WalletFrozenError,
} from "../db/errors";

// The ledger's shared rules. Both stores plan every money movement against
// a LedgerView with `planLedger`, write the planned transfers atomically,
// and audit with `auditLedger`, so the domain logic is written once.

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

export interface LedgerPlan {
  /** New balance for every touched wallet (lower username). */
  balances: Map<string, Cents>;
  /** Wallets debited by a non-reversal transfer (guarded on Sanity). */
  debited: Set<string>;
  reversals: { originalId: string; refundId: string }[];
}

const lower = (username: string) => username.toLowerCase();

const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A credit that is still pending for its recipient at `now`. */
export function isHeld(
  transfer: Pick<ITransfer, "holdUntil" | "reversedBy">,
  now: Date
): boolean {
  return (
    transfer.holdUntil !== null &&
    transfer.reversedBy === null &&
    Date.parse(transfer.holdUntil) > now.getTime()
  );
}

/** The record a planned transfer becomes once written at `createdAt`. */
export function toTransfer(
  pending: PendingTransfer,
  createdAt: string
): ITransfer {
  return {
    id: pending.id,
    kind: pending.kind,
    amount: pending.amount,
    from: pending.from && { ...pending.from },
    to: { ...pending.to },
    note: pending.note,
    context: pending.context && { ...pending.context },
    createdAt,
    holdUntil: pending.holdUntil,
    reversedBy: null,
    reverses: pending.reverses,
  };
}

/** Same amount, parties swapped, and the original is not itself a refund. */
function mirrors(reversal: PendingTransfer, original: ITransfer): boolean {
  return (
    !!reversal.from &&
    !!original.from &&
    original.reverses === null &&
    reversal.amount === original.amount &&
    lower(reversal.from.username) === lower(original.to.username) &&
    lower(reversal.to.username) === lower(original.from.username)
  );
}

/**
 * Applies transfers in order to a working copy of the view, so credits
 * within an operation count before later debits (the demo bot is funded,
 * then pays). Never writes. Throws InsufficientFundsError,
 * WalletFrozenError, InvalidStateError (refund window over / already
 * refunded), or Error on malformed input.
 *
 * - A debit needs an unfrozen sender with enough *available* credits.
 * - A credit needs an unfrozen recipient. A held credit (`holdUntil` after
 *   now) is pending for the recipient, so it is not spendable.
 * - A reversal refunds a held credit before its `holdUntil`, once, with the
 *   same amount and the parties swapped. It debits `balance`, not
 *   `available` (held credits are never spent, so it cannot overdraw), and
 *   ignores freezes: refunds always go through.
 * - Issued credits (`from: null`) have no generic check; callers cap them.
 */
export function planLedger(
  view: LedgerView,
  transfers: PendingTransfer[]
): LedgerPlan {
  const working = new Map<
    string,
    { balance: Cents; pending: Cents; frozen: boolean }
  >();
  const walletOf = (username: string) => {
    const key = lower(username);
    let wallet = working.get(key);
    if (!wallet) {
      const { balance, pending, frozen } = view.wallet(username);
      wallet = { balance, pending, frozen };
      working.set(key, wallet);
    }
    return wallet;
  };
  const now = view.now.getTime();
  const debited = new Set<string>();
  const reversals: LedgerPlan["reversals"] = [];

  for (const transfer of transfers) {
    if (!Number.isSafeInteger(transfer.amount) || transfer.amount <= 0) {
      throw new Error(`Transfer "${transfer.id}" has an invalid amount`);
    }
    if (
      transfer.from &&
      lower(transfer.from.username) === lower(transfer.to.username)
    ) {
      throw new Error(`Transfer "${transfer.id}" pays its own sender`);
    }
    const to = walletOf(transfer.to.username);

    if (transfer.reverses) {
      const original = view.transfer(transfer.reverses);
      if (!original) {
        throw new Error(
          `Transfer "${transfer.id}" reverses unknown "${transfer.reverses}"`
        );
      }
      if (!mirrors(transfer, original)) {
        throw new Error(
          `Transfer "${transfer.id}" does not mirror "${original.id}"`
        );
      }
      const refunded =
        original.reversedBy !== null ||
        reversals.some((reversal) => reversal.originalId === original.id);
      if (refunded) {
        throw new InvalidStateError("This payment was already refunded");
      }
      if (
        original.holdUntil === null ||
        Date.parse(original.holdUntil) <= now
      ) {
        throw new InvalidStateError("The refund window is over");
      }

      const from = walletOf(transfer.from!.username);
      if (from.balance < transfer.amount) {
        throw new InsufficientFundsError(from.balance, transfer.amount);
      }
      from.balance -= transfer.amount;
      from.pending = Math.max(0, from.pending - transfer.amount);
      to.balance += transfer.amount;
      reversals.push({ originalId: original.id, refundId: transfer.id });
      continue;
    }

    if (transfer.from) {
      const from = walletOf(transfer.from.username);
      if (from.frozen) throw new WalletFrozenError(transfer.from.username);
      const available = from.balance - from.pending;
      if (available < transfer.amount) {
        throw new InsufficientFundsError(available, transfer.amount);
      }
      from.balance -= transfer.amount;
      debited.add(lower(transfer.from.username));
    }

    if (to.frozen) throw new WalletFrozenError(transfer.to.username);
    to.balance += transfer.amount;
    if (transfer.holdUntil !== null && Date.parse(transfer.holdUntil) > now) {
      to.pending += transfer.amount;
    }
  }

  return {
    balances: new Map(
      [...working].map(([key, wallet]) => [key, wallet.balance])
    ),
    debited,
    reversals,
  };
}

/**
 * Checks the §6.2 invariants over every stored wallet and transfer: stored
 * balances match their transfers, issued credits equal the total balance,
 * nothing is negative, pending never exceeds the balance, and every
 * reversal mirrors exactly one original. Usernames are lower-cased.
 */
export function auditLedger({
  wallets,
  transfers,
  now,
}: {
  wallets: { username: string; balance: Cents }[];
  transfers: ITransfer[];
  now: Date;
}): LedgerAudit {
  const stored = new Map(
    wallets.map((wallet) => [lower(wallet.username), wallet.balance])
  );
  const computed = new Map<string, Cents>();
  const pending = new Map<string, Cents>();
  const add = (map: Map<string, Cents>, username: string, amount: Cents) =>
    map.set(lower(username), (map.get(lower(username)) ?? 0) + amount);

  let issued = 0;
  for (const transfer of transfers) {
    if (transfer.from) add(computed, transfer.from.username, -transfer.amount);
    else issued += transfer.amount;
    add(computed, transfer.to.username, transfer.amount);
    if (isHeld(transfer, now))
      add(pending, transfer.to.username, transfer.amount);
  }

  const usernames = [...new Set([...stored.keys(), ...computed.keys()])];
  const mismatches = usernames
    .sort(byKey)
    .map((username) => ({
      username,
      stored: stored.get(username) ?? 0,
      computed: computed.get(username) ?? 0,
    }))
    .filter((row) => row.stored !== row.computed);
  const negative = [...stored]
    .filter(([, balance]) => balance < 0)
    .map(([username]) => username)
    .sort(byKey);
  const pendingOverBalance = [...pending]
    .filter(([username, amount]) => amount > (stored.get(username) ?? 0))
    .map(([username]) => username)
    .sort(byKey);

  const byId = new Map(transfers.map((transfer) => [transfer.id, transfer]));
  const refunds = new Map<string, number>();
  for (const { reverses } of transfers) {
    if (reverses) refunds.set(reverses, (refunds.get(reverses) ?? 0) + 1);
  }
  const bad = new Set<string>();
  for (const transfer of transfers) {
    if (transfer.reverses) {
      const original = byId.get(transfer.reverses);
      const valid =
        !!original &&
        original.reversedBy === transfer.id &&
        refunds.get(original.id) === 1 &&
        mirrors(transfer, original);
      if (!valid) bad.add(transfer.id);
    }
    if (
      transfer.reversedBy &&
      byId.get(transfer.reversedBy)?.reverses !== transfer.id
    ) {
      bad.add(transfer.id);
    }
  }
  const badReversals = [...bad].sort(byKey);

  const totalBalance = [...stored.values()].reduce((sum, b) => sum + b, 0);
  return {
    ok:
      issued === totalBalance &&
      mismatches.length === 0 &&
      negative.length === 0 &&
      pendingOverBalance.length === 0 &&
      badReversals.length === 0,
    wallets: wallets.length,
    transfers: transfers.length,
    issued,
    totalBalance,
    mismatches,
    negative,
    pendingOverBalance,
    badReversals,
  };
}
