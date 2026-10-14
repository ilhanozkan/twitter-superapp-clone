import { ConversationKind } from "../../superapp/policy/messages";
import { Cents } from "../../../types/Money";
import {
  ChannelRole,
  IChannel,
  IConversation,
  IMessage,
} from "../../../types/Message";
import { IStory } from "../../../types/Story";
import { IAuthor } from "../../../types/User";
import { IPaymentRequest } from "../../../types/Wallet";
import {
  clampLimit,
  compareNewestFirst,
  Cursor,
  decodeCursor,
  encodeCursor,
} from "../cursor";
import { MessageQuery } from "./types";

// Conversations, memberships and messages as both stores keep them, and
// how they become API objects. The stores only gather records and the
// things messages point at (Tweets, stories, payment requests); everything
// the API shows is decided here, so the two stores answer alike.

/** What a channel is and who made it (a channel conversation's own fields). */
export interface ChannelDetails {
  handle: string;
  name: string;
  description: string | null;
  owner: IAuthor;
}

export interface ConversationRecord {
  id: string;
  kind: ConversationKind;
  createdAt: string;
  /** Channels only. */
  channel?: ChannelDetails;
}

export interface MemberRecord {
  conversationId: string;
  /** A snapshot of the person when they joined. */
  user: IAuthor;
  role: ChannelRole;
  joinedAt: string;
  lastReadAt: string | null;
}

/** What a message says. Money bubbles point at their ledger records. */
export type MessageContent =
  | {
      type: "text";
      text: string;
      tweetId: string | null;
      storyId: string | null;
      /** Whose story it replies to, kept so the reply still says so once the story is gone. */
      storyAuthor: IAuthor | null;
    }
  | { type: "payment"; transferId: string; amount: Cents; note: string | null }
  | { type: "request"; requestId: string };

export interface MessageRecord {
  id: string;
  conversationId: string;
  author: IAuthor;
  createdAt: string;
  content: MessageContent;
  removed: "author" | "moderator" | null;
  /** Fingerprint of the request that wrote it; null for seeds, greetings and money bubbles. */
  requestHash: string | null;
}

export interface TweetRef {
  id: string;
  author: IAuthor;
  text: string;
}

/** What message bodies point at, read once per page. */
export interface MessageRefs {
  /** Visible Tweets only (deleted or moderated: absent). */
  tweets: Map<string, TweetRef>;
  /** Stories the reader can see now. */
  stories: Map<string, IStory>;
  requests: Map<string, IPaymentRequest>;
}

export const toAuthor = ({ username, fullname, image }: IAuthor): IAuthor => ({
  username,
  fullname,
  image,
});

const unique = (ids: (string | null)[]) => [
  ...new Set(ids.filter((id): id is string => id !== null)),
];

/** The Tweets, stories and requests `records` point at, without repeats. */
export function referencedIds(records: MessageRecord[]): {
  tweetIds: string[];
  storyIds: string[];
  requestIds: string[];
} {
  const shown = records.filter((record) => !record.removed);
  const text = shown.flatMap((record) =>
    record.content.type === "text" ? [record.content] : []
  );
  return {
    tweetIds: unique(text.map((content) => content.tweetId)),
    storyIds: unique(text.map((content) => content.storyId)),
    requestIds: unique(
      shown.map((record) =>
        record.content.type === "request" ? record.content.requestId : null
      )
    ),
  };
}

/**
 * The API view of a stored message. A request bubble shows the request as
 * it is now, so both members see it paid or declined on their next read.
 * Null for a request bubble whose request can't be read (never in a sound
 * store), so one bad record can't break a conversation.
 */
export function toMessage(
  record: MessageRecord,
  refs: MessageRefs
): IMessage | null {
  const base = {
    id: record.id,
    conversationId: record.conversationId,
    author: toAuthor(record.author),
    createdAt: record.createdAt,
  };
  if (record.removed) {
    return { ...base, body: { type: "removed", by: record.removed } };
  }

  const { content } = record;
  switch (content.type) {
    case "payment":
      return {
        ...base,
        body: {
          type: "payment",
          transferId: content.transferId,
          amount: content.amount,
          note: content.note,
        },
      };
    case "request": {
      const request = refs.requests.get(content.requestId);
      return request ? { ...base, body: { type: "request", request } } : null;
    }
    case "text": {
      const tweet = content.tweetId ? refs.tweets.get(content.tweetId) : null;
      const story =
        content.storyId && content.storyAuthor
          ? {
              id: content.storyId,
              author: toAuthor(content.storyAuthor),
              preview: refs.stories.get(content.storyId)?.content ?? null,
            }
          : null;
      return {
        ...base,
        body: {
          type: "text",
          text: content.text,
          tweet: tweet
            ? { id: tweet.id, author: toAuthor(tweet.author), text: tweet.text }
            : null,
          story,
        },
      };
    }
  }
}

/** Resolves records, dropping the ones `toMessage` can't show. */
export function toMessages(
  records: MessageRecord[],
  refs: MessageRefs
): IMessage[] {
  return records
    .map((record) => toMessage(record, refs))
    .filter((message): message is IMessage => message !== null);
}

/** A direct conversation as `viewer`'s inbox shows it. */
export function toConversation({
  conversation,
  other,
  last,
  lastMessage,
  unread,
}: {
  conversation: ConversationRecord;
  other: MemberRecord;
  /** The newest stored message (its time dates the conversation). */
  last: MessageRecord | null;
  lastMessage: IMessage | null;
  unread: number;
}): IConversation {
  return {
    id: conversation.id,
    kind: "direct",
    other: toAuthor(other.user),
    lastMessage,
    unread,
    otherReadAt: other.lastReadAt,
    updatedAt: last?.createdAt ?? conversation.createdAt,
  };
}

/** Inbox order: most recently active first, ties by id. */
export function compareConversations(
  a: IConversation,
  b: IConversation
): number {
  return compareNewestFirst(
    { createdAt: a.updatedAt, id: a.id },
    { createdAt: b.updatedAt, id: b.id }
  );
}

/**
 * How a page is read. Without `after`: the newest `limit` messages (older
 * than `before`, if given), read newest first. With `after`: the `limit`
 * messages right after it, read oldest first, which is how a poll fetches
 * what arrived since its last page.
 */
export interface PagePlan {
  before: Cursor | null;
  after: Cursor | null;
  /** The `after` cursor as given, echoed while nothing newer exists. */
  afterCursor: string | null;
  limit: number;
  ascending: boolean;
}

export function planPage(query: MessageQuery = {}): PagePlan {
  const after = decodeCursor(query.after);
  return {
    before: decodeCursor(query.before),
    after,
    afterCursor: after ? query.after! : null,
    limit: clampLimit(query.limit),
    ascending: after !== null,
  };
}

/** Whether a message falls inside the plan's cursors. */
export function inPlan(message: Cursor, plan: PagePlan): boolean {
  return (
    (!plan.before || compareNewestFirst(plan.before, message) < 0) &&
    (!plan.after || compareNewestFirst(message, plan.after) < 0)
  );
}

/**
 * Turns the rows a store read for `plan` (in the plan's direction, at most
 * `limit + 1` of them) into a page, oldest to newest. `olderCursor` is null
 * when the page starts at the conversation's first message; `newestCursor`
 * is the place to poll from.
 */
export function toPage<T extends Cursor>(
  rows: T[],
  plan: PagePlan
): { items: T[]; olderCursor: string | null; newestCursor: string | null } {
  const page = rows.slice(0, plan.limit);
  const items = plan.ascending ? page : [...page].reverse();
  const first = items[0];
  const last = items[items.length - 1];
  const hasOlder = plan.ascending || rows.length > plan.limit;

  return {
    items,
    olderCursor: hasOlder && first ? encodeCursor(first) : null,
    newestCursor: last ? encodeCursor(last) : plan.afterCursor,
  };
}

/** The most channels a list returns. */
export const CHANNEL_LIST_MAX = 100;
/** The most members a channel's member list returns (owner and moderators first). */
export const CHANNEL_MEMBERS_MAX = 200;

/** How a list of channels is ordered: by latest activity, or by size. */
export type ChannelOrder = "activity" | "members";

/** What both stores gather about a channel to show it to a viewer. */
export interface ChannelSummary {
  conversation: ConversationRecord & { channel: ChannelDetails };
  memberCount: number;
  /** The viewer's membership; null for non-members (and anonymous viewers). */
  member: MemberRecord | null;
  /** The newest stored message. */
  last: MessageRecord | null;
  /** Messages by others since the viewer's lastReadAt; 0 for non-members. */
  unread: number;
}

/** A channel as `summary`'s viewer sees it. */
export function toChannel(
  summary: ChannelSummary,
  lastMessage: IMessage | null
): IChannel {
  const { conversation, member } = summary;
  const { handle, name, description, owner } = conversation.channel;
  return {
    id: conversation.id,
    kind: "channel",
    handle,
    name,
    description,
    owner: toAuthor(owner),
    memberCount: summary.memberCount,
    lastMessage,
    createdAt: conversation.createdAt,
    viewer: {
      role: member?.role ?? null,
      unread: member ? summary.unread : 0,
    },
  };
}

/** When a channel last changed: its newest message, else its creation. */
const activityOf = (summary: ChannelSummary) =>
  summary.last?.createdAt ?? summary.conversation.createdAt;

const byHandle = (a: ChannelSummary, b: ChannelSummary) => {
  const [x, y] = [a.conversation.channel.handle, b.conversation.channel.handle];
  return x < y ? -1 : x > y ? 1 : 0;
};

/**
 * Channel list order, ties by handle: the most recently active first (your
 * channels), or the most members first (Discover). Sanity's queries order
 * the same way before cutting the list at CHANNEL_LIST_MAX.
 */
export function compareChannels(
  order: ChannelOrder
): (a: ChannelSummary, b: ChannelSummary) => number {
  return (a, b) => {
    const first =
      order === "activity"
        ? Date.parse(activityOf(b)) - Date.parse(activityOf(a))
        : b.memberCount - a.memberCount;
    return first !== 0 ? first : byHandle(a, b);
  };
}

const ROLE_RANK: Record<ChannelRole, number> = {
  owner: 0,
  moderator: 1,
  member: 2,
};

/** Member list order: the owner, moderators, then members, each by username. */
export function compareMembers(a: MemberRecord, b: MemberRecord): number {
  const byRole = ROLE_RANK[a.role] - ROLE_RANK[b.role];
  if (byRole !== 0) return byRole;
  const [x, y] = [a.user.username.toLowerCase(), b.user.username.toLowerCase()];
  return x < y ? -1 : x > y ? 1 : 0;
}

/** A channel message as authorizing its removal needs it. */
export interface ChannelMessageRef {
  id: string;
  author: IAuthor;
  removed: "author" | "moderator" | null;
}
