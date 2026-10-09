import { IPaymentRequest, PaymentRequestStatus } from "../../types/Wallet";
import {
  ForbiddenError,
  InvalidStateError,
  LimitExceededError,
  NotFoundError,
  WalletFrozenError,
} from "../db/errors";
import type { NewPaymentRequest } from "../db/wallet/types";
import { PendingTransfer } from "./ledger";
import { LIMITS } from "./limits";
import { assertAmount } from "./wallet";

// Payment requests: one person asks another for credits. The record is
// stored with the status a person last set; "expired" is derived from the
// clock on every read, so nothing has to run when a request runs out.

/** A payment request as stored ("expired" is never stored). */
export interface StoredPaymentRequest extends Omit<IPaymentRequest, "status"> {
  status: Exclude<PaymentRequestStatus, "expired">;
  /** Fingerprint of the request that created it; null for seeds. */
  requestHash: string | null;
}

/** listRequests returns at most this many, newest first. */
export const MAX_REQUESTS_LISTED = 100;

export const REQUEST_LIFETIME_MS =
  LIMITS.request.lifetimeDays * 24 * 60 * 60 * 1000;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The stored status, or "expired" for a pending request past its expiry. */
export function requestStatus(
  record: Pick<StoredPaymentRequest, "status" | "expiresAt">,
  now: Date
): PaymentRequestStatus {
  return record.status === "pending" &&
    Date.parse(record.expiresAt) <= now.getTime()
    ? "expired"
    : record.status;
}

/** Whether a request still counts against its requester's pending limit. */
export function isOpenRequest(
  record: Pick<StoredPaymentRequest, "status" | "expiresAt">,
  now: Date
): boolean {
  return requestStatus(record, now) === "pending";
}

export function toPaymentRequestDto(
  record: StoredPaymentRequest,
  now: Date
): IPaymentRequest {
  return {
    id: record.id,
    requester: { ...record.requester },
    payer: { ...record.payer },
    amount: record.amount,
    note: record.note,
    status: requestStatus(record, now),
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    respondedAt: record.respondedAt,
    transferId: record.transferId,
    conversationId: record.conversationId,
  };
}

/**
 * The record a new request becomes. Throws ForbiddenError (asking
 * yourself), LimitExceededError (amount, or `pendingOutgoing` already at
 * the limit) or WalletFrozenError (either party; a frozen wallet can
 * neither pay nor be paid).
 */
export function planPaymentRequest(
  input: NewPaymentRequest,
  ctx: {
    now: Date;
    pendingOutgoing: number;
    requesterFrozen: boolean;
    payerFrozen: boolean;
  }
): StoredPaymentRequest {
  if (same(input.requester.username, input.payer.username)) {
    throw new ForbiddenError("You can't request credits from yourself");
  }
  assertAmount(input.amount, LIMITS.payment, "Requests");
  if (ctx.requesterFrozen)
    throw new WalletFrozenError(input.requester.username);
  if (ctx.payerFrozen) throw new WalletFrozenError(input.payer.username);
  if (ctx.pendingOutgoing >= LIMITS.request.pendingOutgoing) {
    throw new LimitExceededError(
      `You have ${LIMITS.request.pendingOutgoing} pending requests. Wait for an answer or cancel one first.`
    );
  }

  return {
    id: input.operationId,
    requester: { ...input.requester },
    payer: { ...input.payer },
    amount: input.amount,
    note: input.note,
    status: "pending",
    createdAt: ctx.now.toISOString(),
    expiresAt: new Date(ctx.now.getTime() + REQUEST_LIFETIME_MS).toISOString(),
    respondedAt: null,
    transferId: null,
    conversationId: input.conversationId,
    requestHash: input.fingerprint,
  };
}

const CLOSED: Record<Exclude<PaymentRequestStatus, "pending">, string> = {
  paid: "This request was already paid",
  declined: "This request was declined",
  cancelled: "This request was cancelled",
  expired: "This request expired",
};

/** Throws InvalidStateError unless the request can still be answered. */
function assertPending(request: IPaymentRequest): void {
  if (request.status !== "pending") {
    throw new InvalidStateError(CLOSED[request.status]);
  }
}

/**
 * The transfer that pays `request`. Throws NotFoundError unless `payer` is
 * the person asked (others must not learn the request exists) and
 * InvalidStateError unless it is pending and not expired.
 */
export function planRequestPayment(
  request: IPaymentRequest,
  payer: string,
  operationId: string
): PendingTransfer {
  if (!same(request.payer.username, payer)) {
    throw new NotFoundError("Request not found");
  }
  assertPending(request);
  return {
    id: operationId,
    kind: "request",
    from: { ...request.payer },
    to: { ...request.requester },
    amount: request.amount,
    note: request.note,
    context: { type: "request", id: request.id },
    holdUntil: null,
    reverses: null,
  };
}

/**
 * Whether declining (payer) or cancelling (requester) changes `request`.
 * The same action again is a no-op (false). Throws NotFoundError for
 * non-parties, ForbiddenError for the other party, and InvalidStateError
 * for a request that is paid, expired or closed the other way.
 */
export function closeRequestTransition(
  request: IPaymentRequest,
  actor: string,
  action: "decline" | "cancel"
): boolean {
  const isPayer = same(request.payer.username, actor);
  const isRequester = same(request.requester.username, actor);
  if (!isPayer && !isRequester) throw new NotFoundError("Request not found");
  if (action === "decline" && !isPayer) {
    throw new ForbiddenError("Only the person asked to pay can decline");
  }
  if (action === "cancel" && !isRequester) {
    throw new ForbiddenError("Only the person who asked can cancel");
  }

  const target = action === "decline" ? "declined" : "cancelled";
  if (request.status === target) return false;
  assertPending(request);
  return true;
}

/** The status a close action sets. */
export const closedStatus = (action: "decline" | "cancel") =>
  action === "decline" ? ("declined" as const) : ("cancelled" as const);
