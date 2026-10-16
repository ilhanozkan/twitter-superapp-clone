import { LIMITS } from "../../superapp/limits";
import {
  channelConversationId,
  CHANNEL_HANDLE_PATTERN,
  isChannelConversationId,
  memberKey,
} from "../../superapp/messages";
import { ChannelRole } from "../../../types/Message";
import { IAuthor } from "../../../types/User";
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
  ChannelSummary,
  toAuthor,
  toChannel,
} from "../messages/records";
import { ChannelsRepository } from "../messages/types";
import { searchTerms } from "../search";
import {
  CHANNEL_MESSAGE_QUERY,
  CHANNEL_QUERY,
  channelsListQuery,
  MEMBERSHIP_QUERY,
  membersQuery,
  MESSAGE_STATE_QUERY,
  OWNED_CHANNELS_QUERY,
} from "./channelsQueries";
import { SanityDeps } from "./deps";
import { keyOf, KEY_PATTERN, privateId } from "./ids";
import { isConflict, retryOnConflict, SanityMutation } from "./ledger";
import {
  conversationDocument,
  createSanityMessageResolver,
  memberDocument,
  MemberRow,
  memberFromRow,
  messageFromRow,
  MessageRow,
  PartyRow,
  personFrom,
} from "./messages";

const lower = (username: string) => username.toLowerCase();

/** A channel as CHANNEL_PROJECTION reads it. */
interface ChannelRow {
  id: string;
  createdAt: string;
  handle: string;
  name?: string | null;
  description?: string | null;
  owner: PartyRow;
  memberCount: number;
  member: MemberRow | null;
  last: MessageRow | null;
  unread: number;
}

interface MembershipRow {
  channel: { owner: string } | null;
  member: { role: ChannelRole; _rev: string } | null;
}

function summaryFromRow(row: ChannelRow): ChannelSummary {
  return {
    conversation: {
      id: keyOf(row.id),
      kind: "channel",
      createdAt: row.createdAt,
      channel: {
        handle: row.handle,
        // A Studio edit can clear the name; the handle still names it.
        name: row.name || row.handle,
        description: row.description || null,
        owner: personFrom(row.owner),
      },
    },
    memberCount: row.memberCount,
    member: row.member ? memberFromRow(row.member) : null,
    last: row.last ? messageFromRow(row.last) : null,
    unread: row.unread,
  };
}

/**
 * Public channels on Sanity, stored like direct conversations (private
 * documents, so the feature needs a token). The handle is the channel's
 * id, so creating `private.channel-<handle>` takes it exactly once; the
 * 3-per-owner limit is read-checked (the channels budget of 5 an hour
 * bounds what two concurrent creates can add). Role changes and removals
 * are guarded by the document's revision.
 */
export function createSanityChannels(deps: SanityDeps): ChannelsRepository {
  const { read, now } = deps;
  const resolve = createSanityMessageResolver(deps);

  const write = (mutations: SanityMutation[]) =>
    deps.client.mutate(mutations, { visibility: "sync" });

  const channelId = (handle: string) =>
    privateId(channelConversationId(handle));
  const memberId = (handle: string, username: string) =>
    privateId(memberKey(channelConversationId(handle), username));

  const toChannels = async (rows: ChannelRow[], viewer: string | null) => {
    const entries = rows.map(summaryFromRow);
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
    if (!CHANNEL_HANDLE_PATTERN.test(handle)) return null;
    const row = await read<ChannelRow | null>(CHANNEL_QUERY, {
      id: channelId(handle),
      viewer: lower(viewer ?? ""),
    });
    return row ? ((await toChannels([row], viewer))[0] ?? null) : null;
  };

  /** A channel that was just written, as `viewer` now sees it. */
  const readBack = async (handle: string, viewer: string) => {
    const channel = await getChannel(handle, viewer);
    if (!channel) throw new Error(`Channel "${handle}" can't be read`);
    return channel;
  };

  const readMembership = async (handle: string, username: string) => {
    if (!CHANNEL_HANDLE_PATTERN.test(handle)) {
      return { channel: null, member: null };
    }
    return (
      (await read<MembershipRow | null>(MEMBERSHIP_QUERY, {
        id: channelId(handle),
        memberId: memberId(handle, username),
      })) ?? { channel: null, member: null }
    );
  };

  const membership = (
    handle: string,
    user: IAuthor,
    role: ChannelRole,
    at: string
  ) =>
    memberDocument({
      conversationId: channelConversationId(handle),
      user: toAuthor(user),
      role,
      joinedAt: at,
      // Joining reads the channel as it is: only later messages are unread.
      lastReadAt: at,
    });

  return {
    implemented: true,
    configured: deps.canReadPrivate,

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

      const params: Record<string, unknown> = { viewer: lower(viewer ?? "") };
      if (member) params.member = lower(member);
      if (searching) params.search = terms.map((term) => `${term}*`);
      const rows =
        (await read<ChannelRow[]>(
          channelsListQuery(
            { member: !!member, search: searching },
            member ? "activity" : "members",
            CHANNEL_LIST_MAX
          ),
          params
        )) ?? [];
      return toChannels(rows, viewer);
    },

    getChannel,

    async createChannel({ owner, handle, name, description }) {
      deps.assertWritable();
      if (!CHANNEL_HANDLE_PATTERN.test(handle)) {
        throw new Error(`Invalid channel handle "${handle}"`);
      }
      const owned = await read<number>(OWNED_CHANNELS_QUERY, {
        owner: lower(owner.username),
      });
      if ((owned ?? 0) >= LIMITS.channels.createdPerUser) {
        throw new LimitExceededError(
          `You can create up to ${LIMITS.channels.createdPerUser} channels`
        );
      }

      const at = now().toISOString();
      try {
        await write([
          {
            create: conversationDocument({
              id: channelConversationId(handle),
              kind: "channel",
              createdAt: at,
              channel: { handle, name, description, owner: toAuthor(owner) },
            }),
          },
          { create: membership(handle, owner, "owner", at) },
        ]);
      } catch (error) {
        if (isConflict(error)) throw new ConflictError("That handle is taken");
        throw error;
      }
      return readBack(handle, owner.username);
    },

    async setMembership(handle, user, member) {
      deps.assertWritable();
      const access = await readMembership(handle, user.username);
      if (!access.channel) throw new NotFoundError("Channel not found");

      let changed = false;
      if (member && !access.member) {
        try {
          await write([
            {
              create: membership(handle, user, "member", now().toISOString()),
            },
          ]);
          changed = true;
        } catch (error) {
          // A concurrent join committed first: already a member.
          if (!isConflict(error)) throw error;
        }
      } else if (!member && access.member) {
        if (access.member.role === "owner") {
          throw new InvalidStateError("The owner can't leave their channel");
        }
        await write([{ delete: { id: memberId(handle, user.username) } }]);
        changed = true;
      }
      return { channel: await readBack(handle, user.username), changed };
    },

    async setRole(handle, username, role) {
      deps.assertWritable();
      // Guarded by the membership's revision, so a member who leaves
      // meanwhile is not written back (the retry finds them gone).
      return retryOnConflict(deps.sleep, async () => {
        const access = await readMembership(handle, username);
        if (!access.channel) throw new NotFoundError("Channel not found");
        if (!access.member) throw new NotFoundError("Member not found");
        if (access.member.role === "owner") {
          throw new ForbiddenError("The owner's role can't change");
        }
        if (access.member.role !== role) {
          await write([
            {
              patch: {
                id: memberId(handle, username),
                ifRevisionID: access.member._rev,
                set: { role },
              },
            },
          ]);
        }
        return readBack(handle, access.channel.owner);
      });
    },

    async listMembers(handle) {
      if (!CHANNEL_HANDLE_PATTERN.test(handle)) {
        throw new NotFoundError("Channel not found");
      }
      const result = await read<{
        exists: boolean;
        members: MemberRow[];
      } | null>(membersQuery(CHANNEL_MEMBERS_MAX), {
        id: channelId(handle),
        conversationId: channelConversationId(handle),
      });
      if (!result?.exists) throw new NotFoundError("Channel not found");
      return result.members.map((row) => {
        const member = memberFromRow(row);
        return { user: member.user, role: member.role };
      });
    },

    async removeMessage(messageId, by) {
      deps.assertWritable();
      if (!KEY_PATTERN.test(messageId)) {
        throw new NotFoundError("Message not found");
      }
      // Guarded by the message's revision: of concurrent removals, one
      // writes and reports `true`; the others find it removed.
      return retryOnConflict(deps.sleep, async () => {
        const row = await read<{
          conversationId: string;
          removed?: string | null;
          _rev: string;
        } | null>(MESSAGE_STATE_QUERY, { id: privateId(messageId) });
        if (!row || !isChannelConversationId(row.conversationId)) {
          throw new NotFoundError("Message not found");
        }
        if (row.removed) return false;
        await write([
          {
            patch: {
              id: privateId(messageId),
              ifRevisionID: row._rev,
              set: { removed: by },
            },
          },
        ]);
        return true;
      });
    },

    async findMessage(handle, messageId) {
      if (!CHANNEL_HANDLE_PATTERN.test(handle) || !KEY_PATTERN.test(messageId))
        return null;
      const row = await read<{
        id: string;
        author: PartyRow;
        removed?: "author" | "moderator" | null;
      } | null>(CHANNEL_MESSAGE_QUERY, {
        id: privateId(messageId),
        conversationId: channelConversationId(handle),
      });
      return row
        ? {
            id: keyOf(row.id),
            author: personFrom(row.author),
            removed: row.removed ?? null,
          }
        : null;
    },
  };
}
