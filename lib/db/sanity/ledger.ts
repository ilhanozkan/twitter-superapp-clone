import {
  LedgerPlan,
  LedgerView,
  PendingTransfer,
  planLedger,
  toTransfer,
} from "../../superapp/ledger";
import { ITransfer } from "../../../types/Wallet";
import { ConflictError, IdempotencyKeyReusedError } from "../errors";
import type { SanityDeps } from "./deps";
import { assertPublishedFilter, PUBLISHED } from "./groq";
import { privateId, walletKey } from "./ids";
import {
  transferDocument,
  transferFromRow,
  TransferRow,
} from "./walletDocuments";
import { HELD, TRANSFER_FIELDS } from "./walletQueries";

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
    /**
     * Read in the SAME snapshot query. Each query is a GROQ expression
     * (e.g. `count(*[...])`) that may also use the snapshot's `$now`; its
     * own params are namespaced, so names can't clash.
     */
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

/** Commits are tried this many times before answering 409 conflict. */
export const LEDGER_ATTEMPTS = 3;

const lower = (username: string) => username.toLowerCase();

/** 409 (revision mismatch, id taken) or 404 (patched document gone): a concurrent write won. */
export function isConflict(error: unknown): boolean {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return status === 409 || status === 404;
}

const backoff = () => 10 + Math.floor(Math.random() * 51);

/**
 * Runs `attempt` until it stops failing with a conflict, at most
 * LEDGER_ATTEMPTS times with a jittered 10–60 ms pause, then throws
 * ConflictError. For revision-guarded writes outside the ledger (closing a
 * request); each attempt must re-read what it guards.
 */
export async function retryOnConflict<T>(
  sleep: SanityDeps["sleep"],
  attempt: () => Promise<T>
): Promise<T> {
  for (let tries = 1; ; tries++) {
    try {
      return await attempt();
    } catch (error) {
      if (!isConflict(error)) throw error;
      if (tries >= LEDGER_ATTEMPTS) throw new ConflictError();
      await sleep(backoff());
    }
  }
}

const COUNT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Each count's own params renamed to `<count>__<param>`, so counts can share the snapshot query. */
function countClauses(
  counts: Record<string, { query: string; params: Record<string, unknown> }>
) {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  for (const [name, { query, params: own }] of Object.entries(counts)) {
    if (!COUNT_NAME.test(name)) throw new Error(`Invalid count name "${name}"`);
    if (process.env.NODE_ENV === "test") assertPublishedFilter(query);
    let renamed = query;
    for (const [param, value] of Object.entries(own)) {
      if (!COUNT_NAME.test(param)) throw new Error(`Invalid param "${param}"`);
      renamed = renamed.replace(
        new RegExp(`\\$${param}\\b`, "g"),
        `$${name}__${param}`
      );
      params[`${name}__${param}`] = value;
    }
    clauses.push(`"${name}": ${renamed}`);
  }
  return { clause: `{ ${clauses.join(", ")} }`, params };
}

interface WalletRow {
  key: string;
  username: string | null;
  balance: number;
  _rev: string;
}

/** The operation's primary record: its fingerprint, or null when it doesn't exist. */
const PRIMARY = `*[_type == $primaryType && _id == $primaryId && ${PUBLISHED}][0]{ "hash": coalesce(requestHash, "") }`;

interface Snapshot extends LedgerSnapshot {
  /** The primary record's fingerprint ("" for one without), null when absent. */
  primaryHash: string | null;
  wallets: Map<string, WalletRow>;
  originals: Map<string, TransferRow & { _rev: string }>;
}

/** One query: everything an attempt plans from, as of `now`. */
async function readSnapshot(
  read: SanityDeps["read"],
  now: Date,
  {
    primaryType,
    primaryId,
    users,
    reverses,
    counts,
  }: {
    primaryType: string;
    primaryId: string;
    users: string[];
    reverses: string[];
    counts: ReturnType<typeof countClauses>;
  }
): Promise<Snapshot> {
  const row = await read<{
    primary: { hash: string } | null;
    wallets: WalletRow[];
    held: { key: string; amount: number }[];
    freezes: string[];
    originals: (TransferRow & { _rev: string })[];
    counts: Record<string, number> | null;
  }>(
    `{
  "primary": ${PRIMARY},
  "wallets": *[_type == "wallet" && key in $users && ${PUBLISHED}]{ key, username, balance, _rev },
  "held": *[_type == "transfer" && toKey in $users && ${HELD} && ${PUBLISHED}]{ "key": toKey, amount },
  "freezes": *[_type == "walletFreeze" && lower(username) in $users && ${PUBLISHED}].username,
  "originals": *[_type == "transfer" && _id in $originalIds && ${PUBLISHED}]{ ${TRANSFER_FIELDS}, _rev },
  "counts": ${counts.clause}
}`,
    {
      ...counts.params,
      primaryType,
      primaryId,
      users,
      originalIds: reverses.map(privateId),
      now: now.toISOString(),
    }
  );

  const wallets = new Map(row.wallets.map((wallet) => [wallet.key, wallet]));
  const held = new Map<string, number>();
  for (const { key, amount } of row.held)
    held.set(key, (held.get(key) ?? 0) + amount);
  const frozen = new Set(row.freezes.map(lower));
  const originals = new Map(
    row.originals.map((original) => [transferFromRow(original).id, original])
  );

  return {
    now,
    primaryHash: row.primary?.hash ?? null,
    wallets,
    originals,
    wallet(username) {
      const key = lower(username);
      if (!users.includes(key)) {
        throw new Error(
          `@${username}'s wallet is not in this operation's snapshot; list it in parties`
        );
      }
      return {
        exists: wallets.has(key),
        balance: wallets.get(key)?.balance ?? 0,
        pending: held.get(key) ?? 0,
        frozen: frozen.has(key),
      };
    },
    transfer: (id) => {
      const original = originals.get(id);
      return original ? transferFromRow(original) : null;
    },
    rev: (username) => wallets.get(lower(username))?._rev ?? null,
    originalRev: (id) => originals.get(id)?._rev ?? null,
    counts: row.counts ?? {},
  };
}

/**
 * The wallet writes of a plan (§6.8). Debited, refunding, capped and
 * locked wallets are guarded by the snapshot's revision (or created, which
 * conflicts with a concurrent create); every other credit is
 * createIfNotExists + inc, which commutes with concurrent credits.
 */
function walletWrites(
  plan: LedgerPlan,
  snapshot: Snapshot,
  {
    guarded,
    locks,
    names,
    at,
  }: {
    guarded: Set<string>;
    locks: Set<string>;
    names: Map<string, string>;
    at: string;
  }
): SanityMutation[] {
  const writes: SanityMutation[] = [];
  for (const key of new Set([...plan.balances.keys(), ...locks])) {
    const _id = privateId(walletKey(key));
    const stored = snapshot.wallets.get(key);
    const balance = plan.balances.get(key) ?? stored?.balance ?? 0;
    const fresh = {
      _id,
      _type: "wallet",
      username: names.get(key) ?? key,
      key,
      createdAt: at,
      updatedAt: at,
    };

    if (guarded.has(key)) {
      writes.push(
        stored
          ? {
              patch: {
                id: _id,
                ifRevisionID: stored._rev,
                set: { balance, updatedAt: at },
              },
            }
          : { create: { ...fresh, balance } }
      );
      continue;
    }
    const delta = balance - (stored?.balance ?? 0);
    if (delta === 0) continue;
    writes.push(
      { createIfNotExists: { ...fresh, balance: 0 } },
      { patch: { id: _id, inc: { balance: delta }, set: { updatedAt: at } } }
    );
  }
  return writes;
}

/**
 * The Sanity ledger (§6.8). Each attempt reads ONE snapshot (the primary
 * record's fingerprint, the parties' wallets with _rev, their held credits
 * and freezes, the originals being reversed and the requested counts),
 * plans with `planLedger`, and writes everything in ONE transaction. A
 * conflict re-reads the primary record (another request with the same key
 * may have won) and otherwise retries, at most LEDGER_ATTEMPTS times.
 */
export function createSanityLedger(
  deps: Pick<SanityDeps, "client" | "read" | "now" | "sleep">
): SanityLedger {
  return {
    async commit(op) {
      const primaryId = privateId(op.operationId);
      const locks = new Set((op.locks ?? []).map(lower));
      const users = [...new Set([...op.parties.map(lower), ...locks])];
      const counts = countClauses(op.counts ?? {});

      const settle = async (hash: string) => {
        if (hash !== op.fingerprint) throw new IdempotencyKeyReusedError();
        return { result: await op.replay(), replayed: true };
      };

      for (let attempt = 1; ; attempt++) {
        const snapshot = await readSnapshot(deps.read, deps.now(), {
          primaryType: op.primaryType,
          primaryId,
          users,
          reverses: op.reverses ?? [],
          counts,
        });
        if (snapshot.primaryHash !== null) return settle(snapshot.primaryHash);

        const prepared = await op.prepare(snapshot);
        const plan = planLedger(snapshot, prepared.transfers);
        const at = snapshot.now.toISOString();
        const transfers = prepared.transfers.map((t) => toTransfer(t, at));

        // Display usernames for wallets this operation creates.
        const names = new Map<string, string>();
        for (const username of [
          ...op.parties,
          ...(op.locks ?? []),
          ...transfers.flatMap((t) =>
            t.from ? [t.from.username, t.to.username] : [t.to.username]
          ),
        ]) {
          if (!names.has(lower(username))) names.set(lower(username), username);
        }
        const isPrimary = (id: string) => id === op.operationId;
        // The hold that covers a refund can end between this snapshot and
        // the commit and free the credits for a concurrent debit. Guarding
        // the refunding wallet makes that debit force a retry, which then
        // finds the refund window over.
        const refunding = prepared.transfers.flatMap((t) =>
          t.reverses && t.from ? [lower(t.from.username)] : []
        );

        const mutations: SanityMutation[] = [
          ...walletWrites(plan, snapshot, {
            guarded: new Set([
              ...plan.debited,
              ...refunding,
              ...(prepared.cappedCredits ?? []).map(lower),
              ...locks,
            ]),
            locks,
            names,
            at,
          }),
          ...plan.reversals.map(({ originalId, refundId }) => ({
            patch: {
              id: privateId(originalId),
              ifRevisionID: snapshot.originalRev(originalId)!,
              set: { reversedBy: refundId },
            },
          })),
          // The primary record first, carrying the request's fingerprint.
          ...[...transfers]
            .sort((a, b) => Number(isPrimary(b.id)) - Number(isPrimary(a.id)))
            .map((transfer) => ({
              create: transferDocument(
                transfer,
                isPrimary(transfer.id) ? op.fingerprint : null
              ),
            })),
          ...(prepared.mutations?.(transfers) ?? []),
        ];

        try {
          await deps.client.mutate(mutations, { visibility: "sync" });
        } catch (error) {
          if (!isConflict(error)) throw error;
          const winner = await deps.read<{ hash: string } | null>(PRIMARY, {
            primaryType: op.primaryType,
            primaryId,
          });
          if (winner) return settle(winner.hash);
          if (attempt >= LEDGER_ATTEMPTS) throw new ConflictError();
          await deps.sleep(backoff());
          continue;
        }
        return { result: await prepared.result(transfers), replayed: false };
      }
    },
  };
}
