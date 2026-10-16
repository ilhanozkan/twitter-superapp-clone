import { ChannelOrder } from "../messages/records";
import { PUBLISHED } from "./groq";
import { MEMBER_FIELDS, MESSAGE_FIELDS, party } from "./messagesQueries";

// GROQ for channels. A channel is a conversation document with kind
// "channel" at "private.channel-<handle>"; its memberships and messages
// name it by its key, "channel-<handle>". Member counts, the newest message
// and unread counts are computed here, never stored, so joining or posting
// never patches the channel document. The same rules as every SuperApp
// query apply (./groq): typed, PUBLISHED, values as params, and only
// validated integers interpolated.

const CHANNELS = `_type == "conversation" && kind == "channel" && defined(handle) && ${PUBLISHED}`;

const membershipsOf = (key: string) =>
  `*[_type == "conversationMember" && conversationId == ${key} && ${PUBLISHED}]`;

/**
 * A channel as `$viewer` (a lower-case username, "" for nobody) sees it.
 * The first projection names the channel's key, the second gathers what
 * belongs to it, and the third counts what the viewer hasn't read.
 */
const CHANNEL_PROJECTION = `{ ..., "key": "channel-" + handle }{
  "id": _id, createdAt, handle, name, description, "owner": ${party("owner")}, key,
  "memberCount": count(${membershipsOf("^.key")}),
  "member": *[_type == "conversationMember" && conversationId == ^.key && userKey == $viewer && ${PUBLISHED}][0]{ ${MEMBER_FIELDS} },
  "last": *[_type == "message" && conversationId == ^.key && ${PUBLISHED}] | order(createdAt desc, _id desc) [0]{ ${MESSAGE_FIELDS} }
}{
  ...,
  "unread": select(defined(member) => count(*[_type == "message" && conversationId == ^.key && authorKey != $viewer && (!defined(^.member.lastReadAt) || dateTime(createdAt) > dateTime(^.member.lastReadAt)) && ${PUBLISHED}]), 0),
  "lastAt": coalesce(last.createdAt, createdAt)
}`;

/**
 * Channels, optionally only those `$member` belongs to and those whose
 * handle, name or description match `$search` (prefix terms), ordered like
 * `compareChannels` (activity or size, then handle). `limit` is a
 * validated integer.
 */
export const channelsListQuery = (
  filters: { member: boolean; search: boolean },
  order: ChannelOrder,
  limit: number
) =>
  `*[${CHANNELS}${
    filters.member
      ? ` && count(*[_type == "conversationMember" && conversationId == "channel-" + ^.handle && userKey == $member && ${PUBLISHED}]) > 0`
      : ""
  }${
    filters.search
      ? " && (handle match $search || name match $search || description match $search)"
      : ""
  }] ${CHANNEL_PROJECTION} | order(${
    order === "activity" ? "lastAt desc" : "memberCount desc"
  }, handle asc) [0...${limit}]`;

/** `$id`: the channel's private id. */
export const CHANNEL_QUERY = `*[${CHANNELS} && _id == $id][0] ${CHANNEL_PROJECTION}`;

/** Channels `$owner` (lower case) created: the 3-per-person limit. */
export const OWNED_CHANNELS_QUERY = `count(*[_type == "conversation" && kind == "channel" && ownerKey == $owner && ${PUBLISHED}])`;

/** A channel (its owner) and `$memberId`'s membership in it, with the revision that guards a role change. */
export const MEMBERSHIP_QUERY = `{
  "channel": *[${CHANNELS} && _id == $id][0]{ "owner": owner.username },
  "member": *[_type == "conversationMember" && _id == $memberId && ${PUBLISHED}][0]{ role, _rev }
}`;

/** Whether the channel exists, and its members: the owner, moderators, then members, by username. */
export const membersQuery = (limit: number) => `{
  "exists": defined(*[${CHANNELS} && _id == $id][0]._id),
  "members": ${membershipsOf("$conversationId")}{ ${MEMBER_FIELDS}, "rank": select(role == "owner" => 0, role == "moderator" => 1, 2), userKey } | order(rank asc, userKey asc) [0...${limit}]
}`;

/** A message's conversation and removal state, with the revision that guards removing it. */
export const MESSAGE_STATE_QUERY = `*[_type == "message" && _id == $id && ${PUBLISHED}][0]{ conversationId, removed, _rev }`;

/** A message of `$conversationId`, as authorizing its removal needs it. */
export const CHANNEL_MESSAGE_QUERY = `*[_type == "message" && _id == $id && conversationId == $conversationId && ${PUBLISHED}][0]{ "id": _id, "author": ${party("author")}, removed }`;
