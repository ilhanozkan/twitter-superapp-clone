import { auditLedger, LedgerView } from "../../superapp/ledger";
import {
  notifiesRecipient,
  walletNotifications,
} from "../../superapp/notifications";
import {
  closedStatus,
  closeRequestTransition,
  isOpenRequest,
  MAX_REQUESTS_LISTED,
  planPaymentRequest,
  planRequestPayment,
  StoredPaymentRequest,
  toPaymentRequestDto,
} from "../../superapp/requests";
import {
  planSend,
  planTopUp,
  topUpWindowStart,
  toWallet,
  walletLimits,
} from "../../superapp/wallet";
import { Cents } from "../../../types/Money";
import { IPaymentRequest, ITransfer } from "../../../types/Wallet";
import {
  clampLimit,
  compareNewestFirst,
  decodeCursor,
  encodeCursor,
  isAfterCursor,
} from "../cursor";
import { LimitExceededError, NotFoundError } from "../errors";
import type { MemoryState } from "../memory";
import { WalletSeed } from "../seeds/wallet";
import { NewPaymentRequest, WalletRepository } from "../wallet/types";
import { MemoryDeps } from "./deps";
import { publicTransfer } from "./ledger";

export interface StoredTransfer extends ITransfer {
  /** Fingerprint of the request that created it (primary records only). */
  requestHash: string | null;
}

export interface WalletMemoryState {
  /** Keyed by lower-cased username; a missing wallet reads as 0. */
  balances: Map<string, Cents>;
  /** Never evicted: past `limits.transfers`, new money movement is refused. */
  transfers: Map<string, StoredTransfer>;
  /** Never evicted, like transfers. */
  requests: Map<string, StoredPaymentRequest>;
  /** Lower-cased usernames of frozen wallets. */
  frozen: Set<string>;
}

export function createWalletMemoryState(
  seed: WalletSeed | null
): WalletMemoryState {
  return {
    balances: new Map(Object.entries(seed?.balances ?? {})),
    transfers: new Map(
      (seed?.transfers ?? []).map((transfer) => [
        transfer.id,
        { ...structuredClone(transfer), requestHash: null },
      ])
    ),
    requests: new Map(
      (seed?.requests ?? []).map((request) => [
        request.id,
        structuredClone(request),
      ])
    ),
    frozen: new Set(),
  };
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The API view of a stored request at `now` ("expired" is derived). */
export function toPaymentRequest(
  record: StoredPaymentRequest,
  now: Date
): IPaymentRequest {
  return toPaymentRequestDto(record, now);
}

/** Requests `username` asked for that are still open at `now`. */
function pendingOutgoing(
  state: WalletMemoryState,
  username: string,
  now: Date
): number {
  let count = 0;
  state.requests.forEach((request) => {
    if (
      same(request.requester.username, username) &&
      isOpenRequest(request, now)
    )
      count += 1;
  });
  return count;
}

/**
 * Plans a new payment request inside a ledger operation's `prepare`:
 * the requests cap, the requester's pending count and both freezes come
 * from the state, then `planPaymentRequest` decides. Insert the result with
 * `insertRequest` in `apply`, so both happen in one critical section.
 */
export function prepareRequest(
  deps: Pick<MemoryDeps, "state" | "limits">,
  view: LedgerView,
  input: NewPaymentRequest
): StoredPaymentRequest {
  const { requests } = deps.state.wallet;
  if (requests.size >= deps.limits.paymentRequests) {
    throw new LimitExceededError("The demo store is full; restart the server");
  }
  return planPaymentRequest(input, {
    now: view.now,
    pendingOutgoing: pendingOutgoing(
      deps.state.wallet,
      input.requester.username,
      view.now
    ),
    requesterFrozen: view.wallet(input.requester.username).frozen,
    payerFrozen: view.wallet(input.payer.username).frozen,
  });
}

/** Stores a request planned by `prepareRequest` (call it from a ledger `apply`). */
export function insertRequest(
  state: MemoryState,
  record: StoredPaymentRequest
): void {
  state.wallet.requests.set(record.id, structuredClone(record));
}

export function createMemoryWallet(deps: MemoryDeps): WalletRepository {
  const { state, now, ledger } = deps;
  const wallet = state.wallet;

  const readWallet = (username: string) =>
    toWallet(username, ledger.view().wallet(username));

  const transferById = (id: string) => {
    const stored = wallet.transfers.get(id);
    return stored ? publicTransfer(stored) : null;
  };

  /** The fingerprint a primary record was created with ("" for seeds), if it exists. */
  const hashOf = (record: { requestHash: string | null } | undefined) =>
    record ? (record.requestHash ?? "") : undefined;

  const topUpsSince = (username: string, at: Date) => {
    const since = Date.parse(topUpWindowStart(at));
    let count = 0;
    wallet.transfers.forEach((transfer) => {
      if (
        transfer.kind === "issue" &&
        transfer.from === null &&
        same(transfer.to.username, username) &&
        Date.parse(transfer.createdAt) > since
      )
        count += 1;
    });
    return count;
  };

  const visibleTweet = (id: string) => {
    const tweet = state.tweets.get(id);
    return tweet && !tweet.blocked ? { id: tweet.id, text: tweet.text } : null;
  };

  return {
    implemented: true,
    configured: true,

    async notifications(username, limit) {
      const at = now();
      const safeLimit = Math.max(0, Math.floor(limit));
      const newest = <T extends { createdAt: string; id: string }>(
        items: T[],
        order: (item: T) => { createdAt: string; id: string } = (item) => item
      ) =>
        items
          .sort((a, b) => compareNewestFirst(order(a), order(b)))
          .slice(0, safeLimit);

      const received = newest(
        [...wallet.transfers.values()]
          .filter((transfer) => same(transfer.to.username, username))
          .map(publicTransfer)
          .filter(notifiesRecipient)
      );
      const requests = [...wallet.requests.values()].map((record) =>
        toPaymentRequest(record, at)
      );
      const asked = newest(
        requests.filter((request) => same(request.payer.username, username))
      );
      const answered = newest(
        requests.filter(
          (request) =>
            same(request.requester.username, username) &&
            request.respondedAt &&
            (request.status === "paid" || request.status === "declined")
        ),
        (request) => ({ createdAt: request.respondedAt!, id: request.id })
      );

      return walletNotifications(
        username,
        received.map((transfer) => ({
          transfer,
          tweet:
            transfer.context?.type === "tweet"
              ? visibleTweet(transfer.context.id)
              : null,
        })),
        [...asked, ...answered]
      )
        .sort(compareNewestFirst)
        .slice(0, safeLimit);
    },

    async liveActivity() {
      return [];
    },

    async getWallet(username) {
      return readWallet(username);
    },

    async getLimits(username) {
      const at = now();
      return walletLimits({
        topUpsToday: topUpsSince(username, at),
        pendingOutgoing: pendingOutgoing(wallet, username, at),
      });
    },

    async listActivity(username, query = {}) {
      const limit = clampLimit(query.limit);
      const cursor = decodeCursor(query.cursor);
      const matches = [...wallet.transfers.values()]
        .filter(
          (transfer) =>
            (same(transfer.to.username, username) ||
              (!!transfer.from && same(transfer.from.username, username))) &&
            (!cursor || isAfterCursor(transfer, cursor))
        )
        .sort(compareNewestFirst);

      const page = matches.slice(0, limit);
      const last = page[page.length - 1];
      return {
        items: page.map(publicTransfer),
        nextCursor: matches.length > limit && last ? encodeCursor(last) : null,
      };
    },

    async getTransfer(id) {
      return transferById(id);
    },

    async send(input) {
      const { result, replayed } = ledger.commit({
        operationId: input.operationId,
        fingerprint: input.fingerprint,
        storedFingerprint: () =>
          hashOf(wallet.transfers.get(input.operationId)),
        replay: () => ({
          transfer: transferById(input.operationId)!,
          wallet: readWallet(input.from.username),
        }),
        prepare: () => ({
          transfers: [planSend(input)],
          apply: ([transfer]) => ({
            transfer,
            wallet: readWallet(input.from.username),
          }),
        }),
      });
      return { ...result, replayed };
    },

    async topUp(input) {
      const { result, replayed } = ledger.commit({
        operationId: input.operationId,
        fingerprint: input.fingerprint,
        storedFingerprint: () =>
          hashOf(wallet.transfers.get(input.operationId)),
        replay: () => ({
          transfer: transferById(input.operationId)!,
          wallet: readWallet(input.to.username),
        }),
        prepare: (view) => {
          const { balance, frozen } = view.wallet(input.to.username);
          return {
            transfers: [
              planTopUp(input, {
                balance,
                frozen,
                topUpsToday: topUpsSince(input.to.username, view.now),
              }),
            ],
            apply: ([transfer]) => ({
              transfer,
              wallet: readWallet(input.to.username),
            }),
          };
        },
      });
      return { ...result, replayed };
    },

    async createRequest(input) {
      const { result, replayed } = ledger.commit({
        operationId: input.operationId,
        fingerprint: input.fingerprint,
        storedFingerprint: () => hashOf(wallet.requests.get(input.operationId)),
        replay: () =>
          toPaymentRequest(wallet.requests.get(input.operationId)!, now()),
        prepare: (view) => {
          const record = prepareRequest(deps, view, input);
          return {
            transfers: [],
            apply: () => {
              insertRequest(state, record);
              return toPaymentRequest(record, view.now);
            },
          };
        },
      });
      return { request: result, replayed };
    },

    async getRequest(id) {
      const record = wallet.requests.get(id);
      return record ? toPaymentRequest(record, now()) : null;
    },

    async listRequests(username, { role, status }) {
      const at = now();
      return [...wallet.requests.values()]
        .filter((record) =>
          same(
            role === "incoming"
              ? record.payer.username
              : record.requester.username,
            username
          )
        )
        .map((record) => toPaymentRequest(record, at))
        .filter((request) => !status || request.status === status)
        .sort(compareNewestFirst)
        .slice(0, MAX_REQUESTS_LISTED);
    },

    async payRequest(input) {
      const { result, replayed } = ledger.commit({
        operationId: input.operationId,
        fingerprint: input.fingerprint,
        storedFingerprint: () =>
          hashOf(wallet.transfers.get(input.operationId)),
        replay: () => {
          const transfer = transferById(input.operationId)!;
          const paid = transfer.context?.id ?? input.id;
          return {
            transfer,
            request: toPaymentRequest(wallet.requests.get(paid)!, now()),
            wallet: readWallet(input.payer.username),
          };
        },
        prepare: (view) => {
          const record = wallet.requests.get(input.id);
          if (!record) throw new NotFoundError("Request not found");
          const transfer = planRequestPayment(
            toPaymentRequest(record, view.now),
            input.payer.username,
            input.operationId
          );
          return {
            transfers: [transfer],
            apply: ([paid]) => {
              record.status = "paid";
              record.respondedAt = paid.createdAt;
              record.transferId = paid.id;
              return {
                transfer: paid,
                request: toPaymentRequest(record, view.now),
                wallet: readWallet(input.payer.username),
              };
            },
          };
        },
      });
      return { ...result, replayed };
    },

    async closeRequest(id, actor, action) {
      const record = wallet.requests.get(id);
      if (!record) throw new NotFoundError("Request not found");
      const at = now();
      const changed = closeRequestTransition(
        toPaymentRequest(record, at),
        actor,
        action
      );
      if (changed) {
        record.status = closedStatus(action);
        record.respondedAt = at.toISOString();
      }
      return { request: toPaymentRequest(record, at), changed };
    },

    async tipStats(tweetIds, viewer) {
      const stats = new Map(
        tweetIds.map((id) => [id, { tips: 0, tipped: false }])
      );
      wallet.transfers.forEach((transfer) => {
        if (transfer.kind !== "tip" || transfer.context?.type !== "tweet")
          return;
        const stat = stats.get(transfer.context.id);
        if (!stat) return;
        stat.tips += 1;
        if (viewer && transfer.from && same(transfer.from.username, viewer))
          stat.tipped = true;
      });
      return stats;
    },

    async audit() {
      return auditLedger({
        wallets: [...wallet.balances].map(([username, balance]) => ({
          username,
          balance,
        })),
        transfers: [...wallet.transfers.values()].map(publicTransfer),
        now: now(),
      });
    },
  };
}
