import {
  chatMessageId,
  directConversationId,
  greetingMessageId,
  laterOf,
  memberKey,
} from "../../superapp/messages";
import { allowsMoney, canPost, canRead } from "../../superapp/policy/messages";
import { planPaymentRequest } from "../../superapp/requests";
import { planSend } from "../../superapp/wallet";
import { ChannelRole, IConversation, IMessage } from "../../../types/Message";
import { IAuthor } from "../../../types/User";
import { ITransfer } from "../../../types/Wallet";
import {
  ForbiddenError,
  IdempotencyKeyReusedError,
  InvalidStateError,
  NotFoundError,
} from "../errors";
import {
  compareConversations,
  ConversationRecord,
  MemberRecord,
  MessageContent,
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
import { SanityDeps } from "./deps";
import { keyOf, KEY_PATTERN, privateId } from "./ids";
import { isConflict, retryOnConflict, SanityMutation } from "./ledger";
import {
  ACCESS_QUERY,
  CONVERSATION_QUERY,
  CONVERSATIONS_QUERY,
  MESSAGE_QUERY,
  messagesPageQuery,
  REFS_QUERY,
  TWEET_EXISTS_QUERY,
  UNREAD_CONVERSATIONS_QUERY,
} from "./messagesQueries";
import { compact } from "./seeds/documents";
import {
  paymentRequestDocument,
  RequestRow,
  toPaymentRequest,
} from "./walletDocuments";
import { PENDING_OUTGOING_COUNT } from "./walletQueries";

// Conversations, memberships and messages as private Sanity documents
// ("private." ids). The app and the seed export share these converters.

const lower = (username: string) => username.toLowerCase();
const same = (a: string, b: string) => lower(a) === lower(b);

const party = (person: IAuthor) =>
  compact({
    username: person.username,
    fullname: person.fullname,
    image: person.image,
  });

/** A conversation; a channel's also carries its handle, name, description and owner. */
export function conversationDocument(record: ConversationRecord) {
  const { channel } = record;
  return compact({
    _id: privateId(record.id),
    _type: "conversation",
    kind: record.kind,
    ...(channel
      ? {
          handle: channel.handle,
          name: channel.name,
          description: channel.description,
          owner: party(channel.owner),
          ownerKey: lower(channel.owner.username),
        }
      : {}),
    createdAt: record.createdAt,
  });
}

export function memberDocument(record: MemberRecord) {
  return compact({
    _id: privateId(memberKey(record.conversationId, record.user.username)),
    _type: "conversationMember",
    conversationId: record.conversationId,
    username: record.user.username,
    fullname: record.user.fullname,
    image: record.user.image,
    userKey: lower(record.user.username),
    role: record.role,
    joinedAt: record.joinedAt,
    lastReadAt: record.lastReadAt,
  });
}

/** A message as written. Only a text message sent with a key carries `requestHash`. */
export function messageDocument(record: MessageRecord) {
  const { content } = record;
  return compact({
    _id: privateId(record.id),
    _type: "message",
    conversationId: record.conversationId,
    author: party(record.author),
    authorKey: lower(record.author.username),
    bodyType: content.type,
    ...(content.type === "text"
      ? {
          text: content.text,
          tweetId: content.tweetId,
          storyId: content.storyId,
          storyAuthor: content.storyAuthor && party(content.storyAuthor),
        }
      : content.type === "payment"
        ? {
            transferId: content.transferId,
            amount: content.amount,
            note: content.note,
          }
        : { requestId: content.requestId }),
    createdAt: record.createdAt,
    removed: record.removed,
    requestHash: record.requestHash,
  });
}

export type PartyRow = {
  username: string;
  fullname: string;
  image?: string | null;
};

/** A message as MESSAGE_FIELDS reads it. */
export interface MessageRow {
  id: string;
  conversationId: string;
  author: PartyRow;
  createdAt: string;
  bodyType: MessageContent["type"];
  text?: string | null;
  tweetId?: string | null;
  storyId?: string | null;
  storyAuthor?: PartyRow | null;
  amount?: number | null;
  note?: string | null;
  transferId?: string | null;
  requestId?: string | null;
  removed?: "author" | "moderator" | null;
}

/** A membership as MEMBER_FIELDS reads it. */
export interface MemberRow {
  conversationId: string;
  username: string;
  fullname: string;
  image?: string | null;
  role: ChannelRole;
  joinedAt: string;
  lastReadAt?: string | null;
}

export const personFrom = (row: PartyRow): IAuthor => ({
  username: row.username,
  fullname: row.fullname,
  image: row.image ?? null,
});

function contentFrom(row: MessageRow): MessageContent {
  switch (row.bodyType) {
    case "payment":
      return {
        type: "payment",
        transferId: row.transferId ?? "",
        amount: row.amount ?? 0,
        note: row.note ?? null,
      };
    case "request":
      return { type: "request", requestId: row.requestId ?? "" };
    default:
      return {
        type: "text",
        text: row.text ?? "",
        tweetId: row.tweetId ?? null,
        storyId: row.storyId ?? null,
        storyAuthor: row.storyAuthor ? personFrom(row.storyAuthor) : null,
      };
  }
}

export function messageFromRow(
  row: MessageRow & { requestHash?: string | null }
): MessageRecord {
  return {
    id: keyOf(row.id),
    conversationId: row.conversationId,
    author: personFrom(row.author),
    createdAt: row.createdAt,
    content: contentFrom(row),
    removed: row.removed ?? null,
    requestHash: row.requestHash ?? null,
  };
}

export function memberFromRow(row: MemberRow): MemberRecord {
  return {
    conversationId: row.conversationId,
    user: personFrom(row),
    role: row.role,
    joinedAt: row.joinedAt,
    lastReadAt: row.lastReadAt ?? null,
  };
}

/**
 * Turns stored messages into what `viewer` sees, reading what they point at
 * (Tweets and payment requests in one query, stories through their
 * repository). Channels resolve theirs with it too.
 */
export function createSanityMessageResolver(
  deps: SanityDeps
): (records: MessageRecord[], viewer: string) => Promise<IMessage[]> {
  const { read, now } = deps;
  return async (records, viewer) => {
    const { tweetIds, storyIds, requestIds } = referencedIds(records);
    const [found, stories] = await Promise.all([
      tweetIds.length + requestIds.length > 0
        ? read<{ requests: RequestRow[]; tweets: TweetRef[] }>(REFS_QUERY, {
            requestIds: requestIds
              .filter((id) => KEY_PATTERN.test(id))
              .map(privateId),
            tweetIds,
          })
        : null,
      Promise.all(
        storyIds.map((id) => deps.self().stories.getStory(id, viewer))
      ),
    ]);
    const at = now();
    const refs: MessageRefs = {
      tweets: new Map(
        (found?.tweets ?? []).map((tweet) => [
          tweet.id,
          { ...tweet, author: personFrom(tweet.author) },
        ])
      ),
      stories: new Map(
        stories.flatMap((story) => (story ? [[story.id, story] as const] : []))
      ),
      requests: new Map(
        (found?.requests ?? []).map((row) => {
          const request = toPaymentRequest(row, at);
          return [request.id, request] as const;
        })
      ),
    };
    return toMessages(records, refs);
  };
}

interface ConversationRow extends MemberRow {
  conversation: ConversationRecord | null;
  other: MemberRow | null;
  last: MessageRow | null;
  unread: number;
}

interface AccessRow {
  conversation: ConversationRecord | null;
  member: (MemberRow & { _rev: string }) | null;
  other: MemberRow | null;
}

/**
 * Direct messages on Sanity. A payment or request and its bubble are one
 * ledger commit (one transaction); opening a conversation writes it, both
 * memberships and a business's greeting in one transaction too. Private
 * documents need a token, so without one Messages is "unconfigured".
 */
export function createSanityMessages(deps: SanityDeps): MessagesRepository {
  const { read, now, ledger } = deps;

  /** A membership's private id; null when `conversationId` can't have one (too long a key). */
  const memberId = (conversationId: string, username: string) => {
    const key = memberKey(conversationId, username);
    return KEY_PATTERN.test(conversationId) && KEY_PATTERN.test(key)
      ? privateId(key)
      : null;
  };

  const readAccess = async (conversationId: string, username: string) => {
    const member = memberId(conversationId, username);
    if (!member) return { conversation: null, member: null, other: null };
    const row = await read<AccessRow>(ACCESS_QUERY, {
      id: privateId(conversationId),
      conversationId,
      memberId: member,
      key: lower(username),
    });
    return {
      conversation: row?.conversation
        ? { ...row.conversation, id: keyOf(row.conversation.id) }
        : null,
      member: row?.member ?? null,
      other: row?.other ?? null,
    };
  };

  /** Throws unless `username` may post in the conversation. */
  const postable = async (conversationId: string, username: string) => {
    const access = await readAccess(conversationId, username);
    const role = access.member?.role ?? null;
    if (!access.conversation || !canRead(access.conversation.kind, role)) {
      throw new NotFoundError("Conversation not found");
    }
    if (!canPost(role)) {
      throw new ForbiddenError("Join this channel to send messages");
    }
    return access;
  };

  /** The person a payment or request from `username` in this conversation goes to. */
  const payee = async (conversationId: string, username: string) => {
    const access = await postable(conversationId, username);
    if (!allowsMoney(access.conversation!.kind)) {
      throw new InvalidStateError(
        "Payments are only available in direct messages"
      );
    }
    if (!access.other) throw new NotFoundError("Conversation not found");
    return personFrom(access.other);
  };

  const resolve = createSanityMessageResolver(deps);

  const resolveOne = async (record: MessageRecord, viewer: string) => {
    const [message] = await resolve([record], viewer);
    if (!message) throw new Error(`Message "${record.id}" can't be shown`);
    return message;
  };

  /** Turns membership rows (CONVERSATION_PROJECTION) into the viewer's conversations. */
  const toConversations = async (
    rows: ConversationRow[],
    viewer: string
  ): Promise<IConversation[]> => {
    const entries = rows.flatMap((row) =>
      row.conversation?.kind === "direct" && row.other
        ? [
            {
              conversation: {
                ...row.conversation,
                id: keyOf(row.conversation.id),
              },
              other: memberFromRow(row.other),
              last: row.last ? messageFromRow(row.last) : null,
              unread: row.unread,
            },
          ]
        : []
    );
    const lasts = await resolve(
      entries.flatMap((entry) => (entry.last ? [entry.last] : [])),
      viewer
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

  const getConversation = async (
    id: string,
    viewer: string
  ): Promise<IConversation | null> => {
    const member = memberId(id, viewer);
    if (!member) return null;
    const row = await read<ConversationRow | null>(CONVERSATION_QUERY, {
      memberId: member,
      key: lower(viewer),
    });
    return row ? ((await toConversations([row], viewer))[0] ?? null) : null;
  };

  const readMessage = async (id: string) => {
    if (!KEY_PATTERN.test(id)) return null;
    const row = await read<(MessageRow & { requestHash: string }) | null>(
      MESSAGE_QUERY,
      { id: privateId(id) }
    );
    return row ? messageFromRow(row) : null;
  };

  /** The text message stored under `id`, or null; throws when the key was used for another body. */
  const replayText = async (id: string, fingerprint: string) => {
    const stored = await readMessage(id);
    if (!stored) return null;
    if ((stored.requestHash ?? "") !== fingerprint) {
      throw new IdempotencyKeyReusedError();
    }
    return stored;
  };

  const readWallet = (username: string) =>
    deps.self().wallet.getWallet(username);

  const write = (mutations: SanityMutation[]) =>
    deps.client.mutate(mutations, { visibility: "sync" });

  return {
    implemented: true,
    configured: deps.canReadPrivate,

    async notifications() {
      // Payments and requests in chat notify through the wallet.
      return [];
    },

    async liveActivity() {
      return [];
    },

    async unreadConversations(username) {
      return (
        (await read<number>(UNREAD_CONVERSATIONS_QUERY, {
          key: lower(username),
        })) ?? 0
      );
    },

    async listConversations(username) {
      const rows =
        (await read<ConversationRow[]>(CONVERSATIONS_QUERY, {
          key: lower(username),
        })) ?? [];
      return toConversations(rows, username);
    },

    getConversation,

    async findDirect(a, b) {
      if (same(a, b)) return null;
      return getConversation(directConversationId(a, b), a);
    },

    async openDirect(viewer, other) {
      deps.assertWritable();
      if (same(viewer.username, other.username)) {
        throw new ForbiddenError("You can't message yourself");
      }
      const id = directConversationId(viewer.username, other.username);

      // The conversation is created (not createIfNotExists), so of
      // concurrent opens exactly one commits and the others conflict, find
      // it on the retry and report `created: false`.
      return retryOnConflict(deps.sleep, async () => {
        const existing = await getConversation(id, viewer.username);
        if (existing) return { conversation: existing, created: false };

        const business = await deps.self().business.getBusiness(other.username);
        const at = now().toISOString();
        const member = (person: IAuthor, lastReadAt: string | null) =>
          memberDocument({
            conversationId: id,
            user: toAuthor(person),
            role: "member",
            joinedAt: at,
            // The opener has seen everything so far, the greeting included.
            lastReadAt,
          });
        await write([
          {
            create: conversationDocument({ id, kind: "direct", createdAt: at }),
          },
          { createIfNotExists: member(viewer, at) },
          { createIfNotExists: member(other, null) },
          ...(business?.greeting
            ? [
                {
                  createIfNotExists: messageDocument({
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
                  }),
                },
              ]
            : []),
        ]);
        return {
          conversation: (await getConversation(id, viewer.username))!,
          created: true,
        };
      });
    },

    async listMessages(conversationId, viewer, query) {
      const access = await readAccess(conversationId, viewer);
      const role = access.member?.role ?? null;
      if (!access.conversation || !canRead(access.conversation.kind, role)) {
        throw new NotFoundError("Conversation not found");
      }

      const plan = planPage(query);
      const params: Record<string, unknown> = { conversationId };
      const cursorId = (id: string) =>
        KEY_PATTERN.test(id) ? privateId(id) : id;
      if (plan.before) {
        params.beforeCreatedAt = plan.before.createdAt;
        params.beforeId = cursorId(plan.before.id);
      }
      if (plan.after) {
        params.afterCreatedAt = plan.after.createdAt;
        params.afterId = cursorId(plan.after.id);
      }
      const serverNow = now().toISOString();
      const rows =
        (await read<MessageRow[]>(
          messagesPageQuery(
            { before: !!plan.before, after: !!plan.after },
            plan.limit + 1
          ),
          params
        )) ?? [];
      const page = toPage(rows.map(messageFromRow), plan);
      return { ...page, items: await resolve(page.items, viewer), serverNow };
    },

    async sendMessage(input) {
      deps.assertWritable();
      const sender = input.author.username;
      const earlier = await replayText(input.operationId, input.fingerprint);
      if (earlier) {
        return { message: await resolveOne(earlier, sender), replayed: true };
      }

      const tweetId = input.tweetId ?? null;
      const storyId = input.storyId ?? null;
      if (!input.text && !tweetId) {
        throw new Error("A message needs text or a Tweet");
      }
      await postable(input.conversationId, sender);
      if (
        tweetId &&
        !(
          KEY_PATTERN.test(tweetId) &&
          (await read<boolean>(TWEET_EXISTS_QUERY, { id: tweetId }))
        )
      ) {
        throw new NotFoundError("Tweet not found");
      }
      const story = storyId
        ? await deps.self().stories.getStory(storyId, sender)
        : null;
      if (storyId && !story) throw new NotFoundError("Story not found");

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
      try {
        await write([{ create: messageDocument(record) }]);
      } catch (error) {
        // The id is taken: an identical request committed first (a replay),
        // or the key was used for another body.
        if (!isConflict(error)) throw error;
        const won = await replayText(input.operationId, input.fingerprint);
        if (!won) throw error;
        return { message: await resolveOne(won, sender), replayed: true };
      }
      return { message: await resolveOne(record, sender), replayed: false };
    },

    async sendPayment(input) {
      deps.assertWritable();
      const from = input.from.username;
      // Direct conversations never change members, so the payee can be
      // read before the ledger's snapshot.
      const to = await payee(input.conversationId, from);
      const messageId = chatMessageId(input.operationId);
      const bubble = (transfer: ITransfer): MessageRecord => ({
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
      });

      const { result, replayed } = await ledger.commit({
        operationId: input.operationId,
        fingerprint: input.fingerprint,
        primaryType: "transfer",
        parties: [from, to.username],
        replay: async () => ({
          transfer: (await deps.self().wallet.getTransfer(input.operationId))!,
          record: (await readMessage(messageId))!,
        }),
        prepare: async () => ({
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
          mutations: ([transfer]) => [
            { create: messageDocument(bubble(transfer)) },
          ],
          result: ([transfer]) => ({ transfer, record: bubble(transfer) }),
        }),
      });
      return {
        transfer: result.transfer,
        message: await resolveOne(result.record, from),
        wallet: await readWallet(from),
        replayed,
      };
    },

    async sendRequest(input) {
      deps.assertWritable();
      const requester = input.from.username;
      const payer = await payee(input.conversationId, requester);
      const messageId = chatMessageId(input.operationId);

      const { result, replayed } = await ledger.commit({
        operationId: input.operationId,
        fingerprint: input.fingerprint,
        primaryType: "paymentRequest",
        parties: [requester, payer.username],
        // Serializes the requester's requests, so the pending limit is exact.
        locks: [requester],
        counts: {
          pendingOutgoing: {
            query: PENDING_OUTGOING_COUNT,
            params: { key: lower(requester) },
          },
        },
        replay: async () => (await readMessage(messageId))!,
        prepare: async (snapshot) => {
          const request = planPaymentRequest(
            {
              operationId: input.operationId,
              fingerprint: input.fingerprint,
              requester: input.from,
              payer,
              amount: input.amount,
              note: input.note,
              conversationId: input.conversationId,
            },
            {
              now: snapshot.now,
              pendingOutgoing: snapshot.counts.pendingOutgoing,
              requesterFrozen: snapshot.wallet(requester).frozen,
              payerFrozen: snapshot.wallet(payer.username).frozen,
            }
          );
          const record: MessageRecord = {
            id: messageId,
            conversationId: input.conversationId,
            author: toAuthor(input.from),
            createdAt: request.createdAt,
            content: { type: "request", requestId: request.id },
            removed: null,
            requestHash: null,
          };
          return {
            transfers: [],
            mutations: () => [
              { create: paymentRequestDocument(request) },
              { create: messageDocument(record) },
            ],
            result: () => record,
          };
        },
      });
      const message = await resolveOne(result, requester);
      if (message.body.type !== "request") {
        throw new Error(`Message "${message.id}" is not a request`);
      }
      return { message, request: message.body.request, replayed };
    },

    async markRead(conversationId, username) {
      deps.assertWritable();
      // Guarded by the membership's revision, so a slower request can't
      // move the marker back.
      await retryOnConflict(deps.sleep, async () => {
        const { member } = await readAccess(conversationId, username);
        if (!member) return;
        const current = member.lastReadAt ?? null;
        const next = laterOf(current, now().toISOString());
        if (next === current) return;
        await write([
          {
            patch: {
              id: memberId(conversationId, username)!,
              ifRevisionID: member._rev,
              set: { lastReadAt: next },
            },
          },
        ]);
      });
    },
  };
}
