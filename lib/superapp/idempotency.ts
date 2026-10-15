import { createHash } from "crypto";

// Server-only. An operation's id is derived from (actor, scope, key), so a
// retried request finds the record it created, and two actors (or two kinds
// of operation) can use the same key without colliding. The id doubles as
// the primary record's id, which is what makes replays atomic: the check is
// "does the record exist", and creating it is part of the operation's write.

export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export type OperationScope =
  | "wallet.send"
  | "wallet.topUp"
  | "wallet.request"
  | "wallet.payRequest"
  | "tweets.tip"
  | "messages.send"
  | "messages.payment"
  | "messages.request"
  | "orders.place"
  | "orders.demo"
  | "rides.book"
  | "rides.tip";

const sha256 = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");

/** `${prefix}-${sha256hex(lower(actor) + "\n" + scope + "\n" + key).slice(0, 32)}`; dot-free. */
export function operationId(
  prefix: "tx" | "req" | "order" | "ride" | "msg",
  actor: string,
  scope: OperationScope,
  key: string
): string {
  const hash = sha256(`${actor.toLowerCase()}\n${scope}\n${key}`);
  return `${prefix}-${hash.slice(0, 32)}`;
}

/** JSON with sorted keys and undefined dropped, so equal bodies serialize equally. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])])
    );
  }
  return value;
}

/** sha256 hex of canonical JSON (sorted keys, undefined dropped) of the validated body + route params. */
export function fingerprint(value: unknown): string {
  return sha256(JSON.stringify(canonical(value)) ?? "null");
}
