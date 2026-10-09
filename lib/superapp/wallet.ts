import { Cents } from "../../types/Money";
import { IWallet, IWalletLimits } from "../../types/Wallet";
import {
  ForbiddenError,
  LimitExceededError,
  WalletFrozenError,
} from "../db/errors";
import type { SendInput, TopUpInput } from "../db/wallet/types";
import { PendingTransfer } from "./ledger";
import { LIMITS } from "./limits";
import { formatAmount, formatCredits } from "./money";

// Wallet rules both stores share: what a send or a top-up becomes, and how
// a wallet and its limits read. The stores only gather the inputs.

/** Top-ups are limited per rolling 24 hours. */
export const TOP_UP_WINDOW_MS = 24 * 60 * 60 * 1000;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The instant the current top-up window opened (ISO). */
export function topUpWindowStart(now: Date): string {
  return new Date(now.getTime() - TOP_UP_WINDOW_MS).toISOString();
}

export function toWallet(
  username: string,
  {
    balance,
    pending,
    frozen,
  }: { balance: Cents; pending: Cents; frozen: boolean }
): IWallet {
  return { username, balance, pending, available: balance - pending, frozen };
}

export function walletLimits({
  topUpsToday,
  pendingOutgoing,
}: {
  topUpsToday: number;
  pendingOutgoing: number;
}): IWalletLimits {
  return {
    minPayment: LIMITS.payment.min,
    maxPayment: LIMITS.payment.max,
    minTip: LIMITS.tip.min,
    maxTip: LIMITS.tip.max,
    tipPresets: [...LIMITS.tip.presets],
    topUpAmounts: [...LIMITS.topUp.amounts],
    topUpCap: LIMITS.topUp.cap,
    topUpsPerDay: LIMITS.topUp.perDay,
    topUpsLeftToday: Math.max(0, LIMITS.topUp.perDay - topUpsToday),
    pendingRequestsLeft: Math.max(
      0,
      LIMITS.request.pendingOutgoing - pendingOutgoing
    ),
  };
}

/** Throws unless `amount` is whole cents within [min, max]. */
export function assertAmount(
  amount: Cents,
  { min, max }: { min: Cents; max: Cents },
  what: string
): void {
  if (!Number.isSafeInteger(amount)) {
    throw new Error("Amounts are whole hundredths of a credit");
  }
  if (amount < min || amount > max) {
    throw new LimitExceededError(
      `${what} are between ${formatAmount(min)} and ${formatCredits(max)}`
    );
  }
}

/** A payment or tip from one person to another. Throws ForbiddenError (to yourself) or LimitExceededError. */
export function planSend(input: SendInput): PendingTransfer {
  if (same(input.from.username, input.to.username)) {
    throw new ForbiddenError(
      input.kind === "tip"
        ? "You can't tip your own Tweet"
        : "You can't send credits to yourself"
    );
  }
  assertAmount(
    input.amount,
    input.kind === "tip" ? LIMITS.tip : LIMITS.payment,
    input.kind === "tip" ? "Tips" : "Payments"
  );
  return {
    id: input.operationId,
    kind: input.kind,
    from: { ...input.from },
    to: { ...input.to },
    amount: input.amount,
    note: input.note,
    context: input.context && { ...input.context },
    holdUntil: null,
    reverses: null,
  };
}

/**
 * Demo credits issued to `to`. Only the listed amounts, at most
 * `perDay` times per rolling 24 h, and never past the balance cap.
 * Throws WalletFrozenError or LimitExceededError.
 */
export function planTopUp(
  input: TopUpInput,
  ctx: { balance: Cents; frozen: boolean; topUpsToday: number }
): PendingTransfer {
  if (ctx.frozen) throw new WalletFrozenError(input.to.username);
  const amounts: readonly Cents[] = LIMITS.topUp.amounts;
  if (!amounts.includes(input.amount)) {
    const choices = amounts.map(formatAmount);
    throw new LimitExceededError(
      `You can add ${choices.slice(0, -1).join(", ")} or ${choices.at(-1)} credits`
    );
  }
  if (ctx.topUpsToday >= LIMITS.topUp.perDay) {
    throw new LimitExceededError(
      `You can add credits ${LIMITS.topUp.perDay} times a day. Try again later.`
    );
  }
  if (ctx.balance + input.amount > LIMITS.topUp.cap) {
    throw new LimitExceededError(
      `Your balance can't go over ${formatCredits(LIMITS.topUp.cap)}`
    );
  }
  return {
    id: input.operationId,
    kind: "issue",
    from: null,
    to: { ...input.to },
    amount: input.amount,
    note: null,
    context: null,
    holdUntil: null,
    reverses: null,
  };
}
