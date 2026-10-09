// Private SuperApp documents (wallets, transfers, messages...) live under
// "private." path ids. Sanity never returns path documents to anonymous
// requests, even from a public dataset. The API and every DTO use the
// dot-free key; only this module adds or strips the prefix.

const PRIVATE_PREFIX = "private.";

/** Types whose documents are stored under private ids. */
export const PRIVATE_TYPES = [
  "wallet",
  "transfer",
  "paymentRequest",
  "order",
  "ride",
  "driverLock",
  "storyView",
  "conversation",
  "conversationMember",
  "message",
] as const;

/** The only ids the API accepts: dot-free, so a route can never address a path document. */
export const KEY_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;

export function privateId(key: string): string {
  if (!KEY_PATTERN.test(key)) throw new Error(`Invalid document key "${key}"`);
  return PRIVATE_PREFIX + key;
}

/** The dot-free key of a private id (other ids are returned unchanged). */
export function keyOf(id: string): string {
  return id.startsWith(PRIVATE_PREFIX) ? id.slice(PRIVATE_PREFIX.length) : id;
}

/** One wallet per username. */
export function walletKey(username: string): string {
  return `wallet-${username.toLowerCase()}`;
}
