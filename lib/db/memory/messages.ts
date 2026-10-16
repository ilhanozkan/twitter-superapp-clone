import {
  chatMessageId,
  directConversationId,
  greetingMessageId,
  isUnread,
  laterOf,
  memberKey,
} from "../../superapp/messages";
import { allowsMoney, canPost, canRead } from "../../superapp/policy/messages";
import { planSend } from "../../superapp/wallet";
import { IConversation, IMessage } from "../../../types/Message";
import { IStory } from "../../../types/Story";
import { IAuthor } from "../../../types/User";
import { compareNewestFirst } from "../cursor";
import {
  ForbiddenError,
  IdempotencyKeyReusedError,
  InvalidStateError,
  NotFoundError,
} from "../errors";
import {
  compareConversations,
  ConversationRecord,
  inPlan,
  MemberRecord,
  MessageRecord,
  MessageRefs,
  planPage,
  referencedIds,
  toAuthor,
  toConversation,
  toMessages,
  toPage,
  TweetRef,
} from "../messages/records";
import { MessagesRepository } from "../messages/types";
import { MessagesSeed } from "../seeds/messages";
import { MemoryDeps } from "./deps";
import { publicTransfer } from "./ledger";
import { insertRequest, prepareRequest, toPaymentRequest } from "./wallet";

export interface MessagesMemoryState {
  conversations: Map<string, ConversationRecord>;
  /** Keyed by `memberKey(conversationId, username)`. */
  members: Map<string, MemberRecord>;
  /** In the order they were written, so text eviction drops from the front. */
  messages: Map<string, MessageRecord>;
}

export const createMessagesMemoryState: (
  seed: MessagesSeed | null
) => MessagesMemoryState = (seed) => ({
  conversations: new Map(
    (seed?.conversations ?? []).map((conversation) => [
      conversation.id,
      structuredClone(conversation),
    ])
  ),
  members: new Map(
    (seed?.members ?? []).map((member) => [
      memberKey(member.conversationId, member.user.username),
      structuredClone(member),
    ])
  ),
  messages: new Map(
    (seed?.messages ?? []).map((message) => [
      message.id,
      structuredClone(message),
    ])
  ),
});

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The fingerprint a record was written with ("" for seeds), if it exists. */
const hashOf = (record: { requestHash: string | null } | undefined) =>
  record ? (record.requestHash ?? "") : undefined;

interface Summary {
  conversation: ConversationRecord;
  member: MemberRecord;
  other: MemberRecord;
  last: MessageRecord | null;
  unread: number;
}

/** A Tweet a message can show: it exists and isn't moderated. */
function visibleTweetIn(
  state: MemoryDeps["state"],
  id: string
): TweetRef | null {
  const tweet = state.tweets.get(id);
  return tweet && !tweet.blocked
    ? { id: tweet.id, author: toAuthor(tweet.author), text: tweet.text }
    : null;
}

/**
 * Turns stored messages into what `viewer` sees, reading what they point at
 * (Tweets, stories, payment requests) once. Channels resolve theirs with it
 * too.
 */
export function createMemoryMessageResolver(
  deps: MemoryDeps
): (records: MessageRecord[], viewer: string) => Promise<IMessage[]> {
  const { state, now } = deps;
  return async (records, viewer) => {
    const { tweetIds, storyIds, requestIds } = referencedIds(records);
    const stories = await Promise.all(
      storyIds.map((id) => deps.self().stories.getStory(id, viewer))
    );
    const at = now();
    const refs: MessageRefs = {
      tweets: new Map(
        tweetIds.flatMap((id) => {
          const tweet = visibleTweetIn(state, id);
          return tweet ? [[id, tweet] as const] : [];
        })
      ),
      stories: new Map(
        stories.flatMap((story) => (story ? [[story.id, story] as const] : []))
      ),
      requests: new Map(
        requestIds.flatMap((id) => {
          const record = state.wallet.requests.get(id);
          return record ? [[id, toPaymentRequest(record, at)] as const] : [];
        })
      ),
    };
    return toMessages(records, refs);
  };
}

/**
 * Direct messages in memory. Writes that move money run inside the ledger's
 * synchronous critical section, so the transfer or request and its bubble
 * are written together or not at all. Text messages are capped at
 * `limits.messages` and the oldest are dropped first; money bubbles are
 * never dropped (their transfers and requests are capped instead).
 */
export const createMemoryMessages: (deps: MemoryDeps) => MessagesRepository = (
  deps
) => {
  const { state, now, ledger, limits } = deps;
  const store = state.messages;

  const memberOf = (conversationId: string, username: string) =>
    store.members.get(memberKey(conversationId, username)) ?? null;

  /** Members of the given conversations other than `username`. */
  const othersIn = (conversationIds: Set<string>, username: string) => {
    const others = new Map<string, MemberRecord>();
    for (const member of store.members.values()) {
      if (
        conversationIds.has(member.conversationId) &&
        !same(member.user.username, username)
      )
        others.set(member.conversationId, member);
    }
    return others;
  };

  /** Throws unless `username` may post in the conversation. */
  const postable = (conversationId: string, username: string) => {
    const conversation = store.conversations.get(conversationId);
    const role = memberOf(conversationId, username)?.role ?? null;
    if (!conversation || !canRead(conversation.kind, role)) {
      throw new NotFoundError("Conversation not found");
    }
    if (!canPost(role)) {
      throw new ForbiddenError("Join this channel to send messages");
    }
    return conversation;
  };

  /** The person a payment or request from `username` in this conversation goes to. */
  const payee = (conversationId: string, username: string): IAuthor => {
    const conversation = postable(conversationId, username);
    if (!allowsMoney(conversation.kind)) {
      throw new InvalidStateError(
        "Payments are only available in direct messages"
      );
    }
    const other = othersIn(new Set([conversationId]), username).get(
      conversationId
    );
    if (!other) throw new NotFoundError("Conversation not found");
    return toAuthor(other.user);
  };

  const resolve = createMemoryMessageResolver(deps);
  const visibleTweet = (id: string) => visibleTweetIn(state, id);
  const readStory = (id: string, viewer: string): Promise<IStory | null> =>
    deps.self().stories.getStory(id, viewer);

  const resolveOne = async (record: MessageRecord, viewer: string) => {
    const [message] = await resolve([record], viewer);
    if (!message) throw new Error(`Message "${record.id}" can't be shown`);
    return message;
  };

  /** `username`'s direct conversations (or just `only`), with their newest message and unread count. */
  const summaries = (username: string, only?: string): Summary[] => {
    const memberships = new Map<string, MemberRecord>();
    for (const member of store.members.values()) {
      if (only !== undefined && member.conversationId !== only) continue;
      if (same(member.user.username, username))
        memberships.set(member.conversationId, member);
    }
    const others = othersIn(new Set(memberships.keys()), username);

    const mine = new Map<string, Summary>();
    for (const [id, member] of memberships) {
      const conversation = store.conversations.get(id);
      const other = others.get(id);
      if (conversation?.kind !== "direct" || !other) continue;
      mine.set(id, { conversation, member, other, last: null, unread: 0 });
    }
    for (const message of store.messages.values()) {
      const entry = mine.get(message.conversationId);
      if (!entry) continue;
      if (!entry.last || compareNewestFirst(message, entry.last) < 0) {
        entry.last = message;
      }
      if (isUnread(message, username, entry.member.lastReadAt)) {
        entry.unread += 1;
      }
    }
    return [...mine.values()];
  };

  const conversationsOf = async (
    username: string,
    only?: string
  ): Promise<IConversation[]> => {
    const entries = summaries(username, only);
    const lasts = await resolve(
      entries.flatMap((entry) => (entry.last ? [entry.last] : [])),
      username
    );
    const byId = new Map(lasts.map((message) => [message.id, message]));
    return entries
      .map((entry) =>
        toConversation({
          ...entry,
          lastMessage: entry.last ? (byId.get(entry.last.id) ?? null) : null,
        })
      )
      .sort(compareConversations);
  };

  const getConversation = async (id: string, viewer: string) =>
    (await conversationsOf(viewer, id))[0] ?? null;

  /** Drops the oldest text messages past the cap; money bubbles always stay. */
  const evictText = () => {
    let texts = 0;
    for (const message of store.messages.values()) {
      if (message.content.type === "text") texts += 1;
    }
    for (const [id, message] of store.messages) {
      if (texts <= limits.messages) break;
      if (message.content.type !== "text") continue;
      store.messages.delete(id);
      texts -= 1;
    }
  };

  const insert = (record: MessageRecord) => {
    store.messages.set(record.id, structuredClone(record));
    if (record.content.type === "text") evictText();
  };

  /** The text message stored under `id`, or null; throws when the key was used for another body. */
  const replayText = (id: string, fingerprint: string) => {
    const stored = hashOf(store.messages.get(id));
    if (stored === undefined) return null;
    if (stored !== fingerprint) throw new IdempotencyKeyReusedError();
    return store.messages.get(id)!;
  };

  return {
    implemented: true,
    configured: true,

    async notifications() {
      // Payments and requests in chat notify through the wallet.
      return [];
    },

    async liveActivity() {
      return [];
    },

    async unreadConversations(username) {
      return summaries(username).filter((entry) => entry.unread > 0).length;
    },

    async listConversations(username) {
      return conversationsOf(username);
    },

    getConversation,

    async findDirect(a, b) {
      if (same(a, b)) return null;
      return getConversation(directConversationId(a, b), a);
    },

    async openDirect(viewer, other) {
      if (same(viewer.username, other.username)) {
        throw new ForbiddenError("You can't message yourself");
      }
      const id = directConversationId(viewer.username, other.username);
      const business = store.conversations.has(id)
        ? null
        : await deps.self().business.getBusiness(other.username);

      // Synchronous from here: of concurrent opens, the first to get here
      // writes the conversation, both members and the greeting.
      const created = !store.conversations.has(id);
      if (created) {
        const at = now().toISOString();
        store.conversations.set(id, { id, kind: "direct", createdAt: at });
        // The opener has seen everything so far, the greeting included.
        for (const [person, lastReadAt] of [
          [viewer, at],
          [other, null],
        ] as const) {
          store.members.set(memberKey(id, person.username), {
            conversationId: id,
            user: toAuthor(person),
            role: "member",
            joinedAt: at,
            lastReadAt,
          });
        }
        if (business?.greeting) {
          insert({
            id: greetingMessageId(id),
            conversationId: id,
            author: toAuthor(business),
            createdAt: at,
            content: {
              type: "text",
              text: business.greeting,
              tweetId: null,
              storyId: null,
              storyAuthor: null,
            },
            removed: null,
            requestHash: null,
          });
        }
      }
      return {
        conversation: (await getConversation(id, viewer.username))!,
        created,
      };
    },

    async listMessages(conversationId, viewer, query) {
      const conversation = store.conversations.get(conversationId);
      const role = memberOf(conversationId, viewer)?.role ?? null;
      if (!conversation || !canRead(conversation.kind, role)) {
        throw new NotFoundError("Conversation not found");
      }

      const plan = planPage(query);
      const rows = [...store.messages.values()]
        .filter(
          (message) =>
            message.conversationId === conversationId && inPlan(message, plan)
        )
        .sort((a, b) =>
          plan.ascending ? compareNewestFirst(b, a) : compareNewestFirst(a, b)
        )
        .slice(0, plan.limit + 1);
      const serverNow = now().toISOString();
      const page = toPage(rows, plan);
      return { ...page, items: await resolve(page.items, viewer), serverNow };
    },

    async sendMessage(input) {
      const sender = input.author.username;
      const earlier = replayText(input.operationId, input.fingerprint);
      if (earlier) {
        return { message: await resolveOne(earlier, sender), replayed: true };
      }

      const tweetId = input.tweetId ?? null;
      const storyId = input.storyId ?? null;
      if (!input.text && !tweetId) {
        throw new Error("A message needs text or a Tweet");
      }
      postable(input.conversationId, sender);
      if (tweetId && !visibleTweet(tweetId)) {
        throw new NotFoundError("Tweet not found");
      }
      const story = storyId ? await readStory(storyId, sender) : null;
      if (storyId && !story) throw new NotFoundError("Story not found");

      // Synchronous from here: an identical request that finished while
      // the story was read is a replay, not a second message.
      const won = replayText(input.operationId, input.fingerprint);
      if (won)
        return { message: await resolveOne(won, sender), replayed: true };
      postable(input.conversationId, sender);
      const record: MessageRecord = {
        id: input.operationId,
        conversationId: input.conversationId,
        author: toAuthor(input.author),
        createdAt: now().toISOString(),
        content: {
          type: "text",
          text: input.text,
          tweetId,
          storyId,
          storyAuthor: story ? toAuthor(story.author) : null,
        },
        removed: null,
        requestHash: input.fingerprint,
      };
      insert(record);
      return { message: await resolveOne(record, sender), replayed: false };
    },

    async sendPayment(input) {
      const messageId = chatMessageId(input.operationId);
      const { result, replayed } = ledger.commit({
        operationId: input.operationId,
        fingerprint: input.fingerprint,
        storedFingerprint: () =>
          hashOf(state.wallet.transfers.get(input.operationId)),
        replay: () => ({
          transfer: publicTransfer(
            state.wallet.transfers.get(input.operationId)!
          ),
          record: store.messages.get(messageId)!,
        }),
        prepare: () => {
          const to = payee(input.conversationId, input.from.username);
          return {
            transfers: [
              planSend({
                operationId: input.operationId,
                fingerprint: input.fingerprint,
                kind: "payment",
                from: input.from,
                to,
                amount: input.amount,
                note: input.note,
                context: { type: "conversation", id: input.conversationId },
              }),
            ],
            apply: ([transfer]) => {
              const record: MessageRecord = {
                id: messageId,
                conversationId: input.conversationId,
                author: toAuthor(input.from),
                createdAt: transfer.createdAt,
                content: {
                  type: "payment",
                  transferId: transfer.id,
                  amount: transfer.amount,
                  note: transfer.note,
                },
                removed: null,
                requestHash: null,
              };
              insert(record);
              return { transfer, record };
            },
          };
        },
      });
      return {
        transfer: result.transfer,
        message: await resolveOne(result.record, input.from.username),
        wallet: await deps.self().wallet.getWallet(input.from.username),
        replayed,
      };
    },

    async sendRequest(input) {
      const messageId = chatMessageId(input.operationId);
      const { result, replayed } = ledger.commit({
        operationId: input.operationId,
        fingerprint: input.fingerprint,
        storedFingerprint: () =>
          hashOf(state.wallet.requests.get(input.operationId)),
        replay: () => store.messages.get(messageId)!,
        prepare: (view) => {
          const payer = payee(input.conversationId, input.from.username);
          const request = prepareRequest(deps, view, {
            operationId: input.operationId,
            fingerprint: input.fingerprint,
            requester: input.from,
            payer,
            amount: input.amount,
            note: input.note,
            conversationId: input.conversationId,
          });
          return {
            transfers: [],
            apply: () => {
              insertRequest(state, request);
              const record: MessageRecord = {
                id: messageId,
                conversationId: input.conversationId,
                author: toAuthor(input.from),
                createdAt: request.createdAt,
                content: { type: "request", requestId: request.id },
                removed: null,
                requestHash: null,
              };
              insert(record);
              return record;
            },
          };
        },
      });
      const message = await resolveOne(result, input.from.username);
      if (message.body.type !== "request") {
        throw new Error(`Message "${message.id}" is not a request`);
      }
      return { message, request: message.body.request, replayed };
    },

    async markRead(conversationId, username) {
      const member = memberOf(conversationId, username);
      if (!member) return;
      member.lastReadAt = laterOf(member.lastReadAt, now().toISOString());
    },
  };
};
