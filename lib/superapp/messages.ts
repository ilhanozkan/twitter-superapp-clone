// Messages rules both stores share: deterministic ids and what "unread"
// means. Isomorphic (no Node APIs), so the UI can use them too.

const lower = (username: string) => username.toLowerCase();

const DIRECT_PREFIX = "dm-";

/**
 * The one direct conversation between two people: `dm-<lowerA>-<lowerB>`,
 * sorted, so either side finds it without a lookup. Usernames never contain
 * "-", so the id is unambiguous.
 */
export function directConversationId(a: string, b: string): string {
  const [first, second] = [lower(a), lower(b)].sort();
  return `${DIRECT_PREFIX}${first}-${second}`;
}

export function isDirectConversationId(id: string): boolean {
  return id.startsWith(DIRECT_PREFIX);
}

/** One membership per person and conversation. */
export function memberKey(conversationId: string, username: string): string {
  return `member-${conversationId}-${lower(username)}`;
}

/** A business's automatic greeting is written once, with the conversation. */
export function greetingMessageId(conversationId: string): string {
  return `msg-greeting-${conversationId}`;
}

/**
 * The message that goes with a chat payment (`tx-<hash>`) or request
 * (`req-<hash>`): `msg-<hash>`, so a replay finds both records (§6.5).
 */
export function chatMessageId(operationId: string): string {
  return `msg-${operationId.slice(operationId.indexOf("-") + 1)}`;
}

/** Messages the viewer hasn't read: written by someone else after their lastReadAt. */
export function isUnread(
  message: { author: { username: string }; createdAt: string },
  viewer: string,
  lastReadAt: string | null
): boolean {
  return (
    lower(message.author.username) !== lower(viewer) &&
    (lastReadAt === null ||
      Date.parse(message.createdAt) > Date.parse(lastReadAt))
  );
}

/** Read markers only move forward: the later of two instants (ISO). */
export function laterOf(current: string | null, next: string): string {
  return current !== null && Date.parse(current) >= Date.parse(next)
    ? current
    : next;
}

/**
 * Chat order, oldest first: by `createdAt`, ties by id, the order the
 * server pages in (the reverse of `compareNewestFirst`). Isomorphic, so the
 * client can merge polls and optimistic sends into a page.
 */
export function compareOldestFirst(
  a: { createdAt: string; id: string },
  b: { createdAt: string; id: string }
): number {
  const byDate = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (byDate !== 0) return byDate;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

const CHANNEL_PREFIX = "channel-";

/** Channel handles: 3 to 30 lower-case letters, digits or "_" (§4.6). */
export const CHANNEL_HANDLE_PATTERN = /^[a-z0-9_]{3,30}$/;

/**
 * A channel's conversation: `channel-<handle>`. The handle is the id, so
 * creating the conversation is what makes a handle unique.
 */
export function channelConversationId(handle: string): string {
  return `${CHANNEL_PREFIX}${handle}`;
}

export function isChannelConversationId(id: string): boolean {
  return id.startsWith(CHANNEL_PREFIX);
}

/** The handle a URL names, in the one case handles are stored in; null for anything else. */
export function parseChannelHandle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const handle = value.toLowerCase();
  return CHANNEL_HANDLE_PATTERN.test(handle) ? handle : null;
}
