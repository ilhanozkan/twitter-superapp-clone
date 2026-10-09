import { auditLedger } from "../../superapp/ledger";
import { walletNotifications } from "../../superapp/notifications";
import {
  closedStatus,
  closeRequestTransition,
  MAX_REQUESTS_LISTED,
  planPaymentRequest,
  planRequestPayment,
  toPaymentRequestDto,
} from "../../superapp/requests";
import {
  planSend,
  planTopUp,
  topUpWindowStart,
  toWallet,
  walletLimits,
} from "../../superapp/wallet";
import { INotification } from "../../../types/Notification";
import { IPaymentRequest } from "../../../types/Wallet";
import {
  clampLimit,
  compareNewestFirst,
  decodeCursor,
  encodeCursor,
} from "../cursor";
import { NotFoundError } from "../errors";
import { WalletRepository } from "../wallet/types";
import { SanityDeps } from "./deps";
import { KEY_PATTERN, privateId } from "./ids";
import { retryOnConflict } from "./ledger";
import {
  paymentRequestDocument,
  RequestRow,
  toPaymentRequest,
  transferFromRow,
  TransferRow,
} from "./walletDocuments";
import {
  activityQuery,
  AUDIT_QUERY,
  LIMITS_QUERY,
  notificationsQuery,
  PENDING_OUTGOING_COUNT,
  REQUEST_QUERY,
  requestsQuery,
  TIPS_QUERY,
  TOP_UPS_COUNT,
  TRANSFER_QUERY,
  WALLET_QUERY,
} from "./walletQueries";

// Building blocks lanes reuse to put requests and transfers in their own
// transactions (B1's sendRequest and sendPayment).
export {
  paymentRequestDocument,
  toPaymentRequest,
  transferDocument,
  transferFromRow,
} from "./walletDocuments";
export { REQUEST_FIELDS, TRANSFER_FIELDS } from "./walletQueries";

const lower = (username: string) => username.toLowerCase();
const same = (a: string, b: string) => lower(a) === lower(b);

/**
 * Wallets on Sanity. Every write goes through the ledger (one snapshot,
 * one transaction); private documents need a token, so without one the
 * wallet is "unconfigured".
 */
export function createSanityWallet(deps: SanityDeps): WalletRepository {
  const { read, ledger, now } = deps;

  const getWallet = async (username: string) => {
    const row = await read<{
      balance: number | null;
      held: number[];
      frozen: boolean;
    }>(WALLET_QUERY, { key: lower(username), now: now().toISOString() });
    return toWallet(username, {
      balance: row?.balance ?? 0,
      pending: (row?.held ?? []).reduce((sum, amount) => sum + amount, 0),
      frozen: !!row?.frozen,
    });
  };

  const getTransfer = async (id: string) => {
    if (!KEY_PATTERN.test(id)) return null;
    const row = await read<TransferRow | null>(TRANSFER_QUERY, {
      id: privateId(id),
    });
    return row ? transferFromRow(row) : null;
  };

  const readRequest = async (id: string) => {
    if (!KEY_PATTERN.test(id)) return null;
    return read<(RequestRow & { _rev: string }) | null>(REQUEST_QUERY, {
      id: privateId(id),
    });
  };

  const getRequest = async (id: string) => {
    const row = await readRequest(id);
    return row ? toPaymentRequest(row, now()) : null;
  };

  return {
    implemented: true,
    configured: deps.canReadPrivate,

    async notifications(username, limit) {
      const safeLimit = Math.max(0, Math.floor(limit));
      if (safeLimit === 0) return [];
      const at = now();
      const row = await read<{
        received: (TransferRow & {
          tweet: { id: string; text: string } | null;
        })[];
        asked: RequestRow[];
        answered: RequestRow[];
      }>(notificationsQuery(safeLimit), { key: lower(username) });

      const notifications: INotification[] = walletNotifications(
        username,
        row.received.map(({ tweet, ...transfer }) => ({
          transfer: transferFromRow(transfer),
          tweet: tweet ?? null,
        })),
        [...row.asked, ...row.answered].map((request) =>
          toPaymentRequest(request, at)
        )
      );
      return notifications.sort(compareNewestFirst).slice(0, safeLimit);
    },

    async liveActivity() {
      return [];
    },

    getWallet,

    async getLimits(username) {
      const at = now();
      const row = await read<{ topUps: number; pendingOutgoing: number }>(
        LIMITS_QUERY,
        {
          key: lower(username),
          since: topUpWindowStart(at),
          now: at.toISOString(),
        }
      );
      return walletLimits({
        topUpsToday: row.topUps,
        pendingOutgoing: row.pendingOutgoing,
      });
    },

    async listActivity(username, query = {}) {
      const limit = clampLimit(query.limit);
      const cursor = decodeCursor(query.cursor);
      const params: Record<string, unknown> = { key: lower(username) };
      if (cursor) {
        params.cursorCreatedAt = cursor.createdAt;
        params.cursorId = KEY_PATTERN.test(cursor.id)
          ? privateId(cursor.id)
          : cursor.id;
      }
      const rows =
        (await read<TransferRow[]>(
          activityQuery(!!cursor, limit + 1),
          params
        )) ?? [];
      const page = rows.slice(0, limit).map(transferFromRow);
      const last = page[page.length - 1];
      return {
        items: page,
        nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
      };
    },

    getTransfer,

    async send(input) {
      deps.assertWritable();
      const { result, replayed } = await ledger.commit({
        operationId: input.operationId,
        fingerprint: input.fingerprint,
        primaryType: "transfer",
        parties: [input.from.username, input.to.username],
        replay: async () => ({
          transfer: (await getTransfer(input.operationId))!,
          wallet: await getWallet(input.from.username),
        }),
        prepare: async () => ({
          transfers: [planSend(input)],
          result: async ([transfer]) => ({
            transfer,
            wallet: await getWallet(input.from.username),
          }),
        }),
      });
      return { ...result, replayed };
    },

    async topUp(input) {
      deps.assertWritable();
      const to = input.to.username;
      const { result, replayed } = await ledger.commit({
        operationId: input.operationId,
        fingerprint: input.fingerprint,
        primaryType: "transfer",
        parties: [to],
        // The wallet's revision serializes top-ups, so the daily count is exact.
        locks: [to],
        counts: {
          topUpsToday: {
            query: TOP_UPS_COUNT,
            params: { key: lower(to), since: topUpWindowStart(now()) },
          },
        },
        replay: async () => ({
          transfer: (await getTransfer(input.operationId))!,
          wallet: await getWallet(to),
        }),
        prepare: async (snapshot) => {
          const { balance, frozen } = snapshot.wallet(to);
          return {
            transfers: [
              planTopUp(input, {
                balance,
                frozen,
                topUpsToday: snapshot.counts.topUpsToday,
              }),
            ],
            cappedCredits: [to],
            result: async ([transfer]) => ({
              transfer,
              wallet: await getWallet(to),
            }),
          };
        },
      });
      return { ...result, replayed };
    },

    async createRequest(input) {
      deps.assertWritable();
      const requester = input.requester.username;
      const { result, replayed } = await ledger.commit({
        operationId: input.operationId,
        fingerprint: input.fingerprint,
        primaryType: "paymentRequest",
        parties: [requester, input.payer.username],
        // Serializes the requester's requests, so the pending limit is exact.
        locks: [requester],
        counts: {
          pendingOutgoing: {
            query: PENDING_OUTGOING_COUNT,
            params: { key: lower(requester) },
          },
        },
        replay: async () => (await getRequest(input.operationId))!,
        prepare: async (snapshot) => {
          const record = planPaymentRequest(input, {
            now: snapshot.now,
            pendingOutgoing: snapshot.counts.pendingOutgoing,
            requesterFrozen: snapshot.wallet(requester).frozen,
            payerFrozen: snapshot.wallet(input.payer.username).frozen,
          });
          return {
            transfers: [],
            mutations: () => [{ create: paymentRequestDocument(record) }],
            result: () => toPaymentRequestDto(record, snapshot.now),
          };
        },
      });
      return { request: result, replayed };
    },

    getRequest,

    async listRequests(username, { role, status }) {
      return (
        (await read<RequestRow[]>(
          requestsQuery(role, status, MAX_REQUESTS_LISTED),
          {
            key: lower(username),
            now: now().toISOString(),
            ...(status ? { status } : {}),
          }
        )) ?? []
      ).map((row) => toPaymentRequest(row, now()));
    },

    async payRequest(input) {
      deps.assertWritable();
      // The parties never change, so they can be read before the snapshot.
      const found = await readRequest(input.id);
      if (!found || !same(found.payer.username, input.payer.username)) {
        throw new NotFoundError("Request not found");
      }
      const replayRequest = async (id: string) => (await getRequest(id))!;

      const { result, replayed } = await ledger.commit({
        operationId: input.operationId,
        fingerprint: input.fingerprint,
        primaryType: "transfer",
        parties: [input.payer.username, found.requester.username],
        replay: async () => {
          const transfer = (await getTransfer(input.operationId))!;
          return {
            transfer,
            request: await replayRequest(transfer.context?.id ?? input.id),
            wallet: await getWallet(input.payer.username),
          };
        },
        prepare: async (snapshot) => {
          // Re-read on every attempt: the status patch is guarded by this _rev.
          const row = await readRequest(input.id);
          if (!row) throw new NotFoundError("Request not found");
          const request = toPaymentRequest(row, snapshot.now);
          const transfer = planRequestPayment(
            request,
            input.payer.username,
            input.operationId
          );
          const paid = (createdAt: string): IPaymentRequest => ({
            ...request,
            status: "paid",
            respondedAt: createdAt,
            transferId: transfer.id,
          });
          return {
            transfers: [transfer],
            mutations: ([written]) => [
              {
                patch: {
                  id: privateId(input.id),
                  ifRevisionID: row._rev,
                  set: {
                    status: "paid",
                    respondedAt: written.createdAt,
                    transferId: written.id,
                  },
                },
              },
            ],
            result: async ([written]) => ({
              transfer: written,
              request: paid(written.createdAt),
              wallet: await getWallet(input.payer.username),
            }),
          };
        },
      });
      return { ...result, replayed };
    },

    async closeRequest(id, actor, action) {
      deps.assertWritable();
      return retryOnConflict(deps.sleep, async () => {
        const row = await readRequest(id);
        if (!row) throw new NotFoundError("Request not found");
        const at = now();
        const request = toPaymentRequest(row, at);
        if (!closeRequestTransition(request, actor, action)) {
          return { request, changed: false };
        }

        const status = closedStatus(action);
        const respondedAt = at.toISOString();
        await deps.client.mutate(
          [
            {
              patch: {
                id: privateId(id),
                ifRevisionID: row._rev,
                set: { status, respondedAt },
              },
            },
          ],
          { visibility: "sync" }
        );
        return { request: { ...request, status, respondedAt }, changed: true };
      });
    },

    async tipStats(tweetIds, viewer) {
      const stats = new Map(
        tweetIds.map((id) => [id, { tips: 0, tipped: false }])
      );
      if (tweetIds.length === 0) return stats;
      const rows = await read<{ tweetId: string; from: string | null }[]>(
        TIPS_QUERY,
        { ids: tweetIds }
      );
      for (const { tweetId, from } of rows ?? []) {
        const stat = stats.get(tweetId);
        if (!stat) continue;
        stat.tips += 1;
        if (viewer && from && same(from, viewer)) stat.tipped = true;
      }
      return stats;
    },

    async audit() {
      const row = await read<{
        wallets: { username: string; balance: number }[];
        transfers: TransferRow[];
      }>(AUDIT_QUERY);
      return auditLedger({
        wallets: row.wallets,
        transfers: row.transfers.map(transferFromRow),
        now: now(),
      });
    },
  };
}
