import { LIMITS } from "../../superapp/limits";
import {
  channelConversationId,
  CHANNEL_HANDLE_PATTERN,
  isChannelConversationId,
  isUnread,
  memberKey,
} from "../../superapp/messages";
import { compareNewestFirst } from "../cursor";
import {
  ConflictError,
  ForbiddenError,
  InvalidStateError,
  LimitExceededError,
  NotFoundError,
} from "../errors";
import {
  CHANNEL_LIST_MAX,
  CHANNEL_MEMBERS_MAX,
  ChannelDetails,
  ChannelSummary,
  compareChannels,
  compareMembers,
  ConversationRecord,
  toAuthor,
  toChannel,
} from "../messages/records";
import { ChannelsRepository } from "../messages/types";
import { matchesSearch, searchTerms } from "../search";
import { MemoryDeps } from "./deps";
import { createMemoryMessageResolver } from "./messages";

type ChannelConversation = ConversationRecord & { channel: ChannelDetails };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const isChannel = (
  conversation: ConversationRecord | undefined
): conversation is ChannelConversation =>
  conversation?.kind === "channel" && !!conversation.channel;

/**
 * Public channels on the messages engine, in memory: a channel is the
 * conversation `channel-<handle>` with the channel's details, and its
 * people are that conversation's memberships (owner, moderators,
 * members). Its messages are read, sent and marked read through the
 * messages repository. Every write is synchronous once it starts, so a
 * handle is taken exactly once and the 3-per-owner limit is exact.
 */
export const createMemoryChannels: (deps: MemoryDeps) => ChannelsRepository = (
  deps
) => {
  const { state, now } = deps;
  const store = state.messages;
  const resolve = createMemoryMessageResolver(deps);

  const channelOf = (handle: string) => {
    const conversation = store.conversations.get(channelConversationId(handle));
    return isChannel(conversation) ? conversation : null;
  };

  /** Member counts, the viewer's membership, the newest message and unread, in one pass. */
  const summarize = (
    conversations: ChannelConversation[],
    viewer: string | null
  ): ChannelSummary[] => {
    const byId = new Map(
      conversations.map((conversation): [string, ChannelSummary] => [
        conversation.id,
        { conversation, memberCount: 0, member: null, last: null, unread: 0 },
      ])
    );
    for (const member of store.members.values()) {
      const entry = byId.get(member.conversationId);
      if (!entry) continue;
      entry.memberCount += 1;
      if (viewer !== null && same(member.user.username, viewer)) {
        entry.member = member;
      }
    }
    for (const message of store.messages.values()) {
      const entry = byId.get(message.conversationId);
      if (!entry) continue;
      if (!entry.last || compareNewestFirst(message, entry.last) < 0) {
        entry.last = message;
      }
      if (
        entry.member &&
        isUnread(message, entry.member.user.username, entry.member.lastReadAt)
      ) {
        entry.unread += 1;
      }
    }
    return [...byId.values()];
  };

  const toChannels = async (
    entries: ChannelSummary[],
    viewer: string | null
  ) => {
    const lasts = await resolve(
      entries.flatMap((entry) => (entry.last ? [entry.last] : [])),
      viewer ?? ""
    );
    const byId = new Map(lasts.map((message) => [message.id, message]));
    return entries.map((entry) =>
      toChannel(entry, entry.last ? (byId.get(entry.last.id) ?? null) : null)
    );
  };

  const getChannel = async (handle: string, viewer: string | null) => {
    const conversation = channelOf(handle);
    if (!conversation) return null;
    const [channel] = await toChannels(
      summarize([conversation], viewer),
      viewer
    );
    return channel;
  };

  /** A channel that was just written, as `viewer` now sees it. */
  const readBack = async (handle: string, viewer: string) => {
    const channel = await getChannel(handle, viewer);
    if (!channel) throw new Error(`Channel "${handle}" can't be read`);
    return channel;
  };

  return {
    implemented: true,
    configured: true,

    async notifications() {
      return [];
    },

    async liveActivity() {
      return [];
    },

    async listChannels({ member, search }, viewer) {
      // Blank searches are ignored; punctuation-only ones ("!!!") match nothing.
      const searching = !!search?.trim();
      const terms = searchTerms(search ?? "");
      if (searching && terms.length === 0) return [];

      const candidates = [...store.conversations.values()].filter(
        (conversation): conversation is ChannelConversation =>
          isChannel(conversation) &&
          (!member || store.members.has(memberKey(conversation.id, member))) &&
          (!searching ||
            matchesSearch(
              [
                conversation.channel.handle,
                conversation.channel.name,
                conversation.channel.description ?? "",
              ],
              terms
            ))
      );
      const entries = summarize(candidates, viewer)
        .sort(compareChannels(member ? "activity" : "members"))
        .slice(0, CHANNEL_LIST_MAX);
      return toChannels(entries, viewer);
    },

    getChannel,

    async createChannel({ owner, handle, name, description }) {
      if (!CHANNEL_HANDLE_PATTERN.test(handle)) {
        throw new Error(`Invalid channel handle "${handle}"`);
      }
      const owned = [...store.conversations.values()].filter(
        (conversation) =>
          isChannel(conversation) &&
          same(conversation.channel.owner.username, owner.username)
      ).length;
      if (owned >= LIMITS.channels.createdPerUser) {
        throw new LimitExceededError(
          `You can create up to ${LIMITS.channels.createdPerUser} channels`
        );
      }
      const id = channelConversationId(handle);
      if (store.conversations.has(id)) {
        throw new ConflictError("That handle is taken");
      }

      const at = now().toISOString();
      store.conversations.set(id, {
        id,
        kind: "channel",
        createdAt: at,
        channel: { handle, name, description, owner: toAuthor(owner) },
      });
      store.members.set(memberKey(id, owner.username), {
        conversationId: id,
        user: toAuthor(owner),
        role: "owner",
        joinedAt: at,
        lastReadAt: at,
      });
      return readBack(handle, owner.username);
    },

    async setMembership(handle, user, member) {
      const conversation = channelOf(handle);
      if (!conversation) throw new NotFoundError("Channel not found");
      const key = memberKey(conversation.id, user.username);
      const existing = store.members.get(key);

      let changed = false;
      if (member && !existing) {
        const at = now().toISOString();
        // Joining reads the channel as it is: only later messages are unread.
        store.members.set(key, {
          conversationId: conversation.id,
          user: toAuthor(user),
          role: "member",
          joinedAt: at,
          lastReadAt: at,
        });
        changed = true;
      } else if (!member && existing) {
        if (existing.role === "owner") {
          throw new InvalidStateError("The owner can't leave their channel");
        }
        store.members.delete(key);
        changed = true;
      }
      return { channel: await readBack(handle, user.username), changed };
    },

    async setRole(handle, username, role) {
      const conversation = channelOf(handle);
      if (!conversation) throw new NotFoundError("Channel not found");
      const member = store.members.get(memberKey(conversation.id, username));
      if (!member) throw new NotFoundError("Member not found");
      if (member.role === "owner") {
        throw new ForbiddenError("The owner's role can't change");
      }
      member.role = role;
      return readBack(handle, conversation.channel.owner.username);
    },

    async listMembers(handle) {
      const conversation = channelOf(handle);
      if (!conversation) throw new NotFoundError("Channel not found");
      return [...store.members.values()]
        .filter((member) => member.conversationId === conversation.id)
        .sort(compareMembers)
        .slice(0, CHANNEL_MEMBERS_MAX)
        .map((member) => ({ user: toAuthor(member.user), role: member.role }));
    },

    async removeMessage(messageId, by) {
      const message = store.messages.get(messageId);
      if (!message || !isChannelConversationId(message.conversationId)) {
        throw new NotFoundError("Message not found");
      }
      if (message.removed) return false;
      message.removed = by;
      return true;
    },

    async findMessage(handle, messageId) {
      const message = store.messages.get(messageId);
      if (message?.conversationId !== channelConversationId(handle)) {
        return null;
      }
      return {
        id: message.id,
        author: toAuthor(message.author),
        removed: message.removed,
      };
    },
  };
};
