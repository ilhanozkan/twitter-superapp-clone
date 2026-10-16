import { PUBLISHED } from "./groq";
import { TWEET_FILTER } from "./queries";
import { REQUEST_FIELDS } from "./walletQueries";

// GROQ for conversations, memberships and messages. Every query follows the
// SuperApp rules in ./groq: typed, PUBLISHED, values as params, and only
// validated integers interpolated. A conversation's last message and unread
// count are always computed here, never stored, so sending a message never
// patches the conversation document (no hot spot).

export const party = (field: string) =>
  `${field}{ "username": username, "fullname": coalesce(fullname, username), "image": image }`;

/** A message document as `messageFromRow` reads it; `id` is the private id. */
export const MESSAGE_FIELDS = `"id": _id, conversationId, "author": ${party(
  "author"
)}, createdAt, bodyType, text, tweetId, storyId, "storyAuthor": ${party(
  "storyAuthor"
)}, amount, note, transferId, requestId, removed`;

/** A membership as `memberFromRow` reads it. */
export const MEMBER_FIELDS = `conversationId, username, "fullname": coalesce(fullname, username), image, role, joinedAt, lastReadAt`;

const CONVERSATION_FIELDS = `"id": _id, kind, createdAt`;

// Conversation documents live at "private." + their id (lib/db/sanity/ids.ts);
// these joins run per membership, where the id can't be a param.
const conversationOf = (member: string) =>
  `*[_type == "conversation" && _id == "private." + ${member}.conversationId && ${PUBLISHED}][0]`;

/** `^` is a membership of `$key`: messages someone else wrote after its lastReadAt. */
const UNREAD = `*[_type == "message" && conversationId == ^.conversationId && authorKey != $key && (!defined(^.lastReadAt) || dateTime(createdAt) > dateTime(^.lastReadAt)) && ${PUBLISHED}]`;

/** Memberships of `$key` in direct conversations. */
const DIRECT_MEMBERSHIPS = `*[_type == "conversationMember" && userKey == $key && string::startsWith(conversationId, "dm-") && ${PUBLISHED}]`;

/** A direct conversation as `$key`'s membership sees it. */
const CONVERSATION_PROJECTION = `{
  ${MEMBER_FIELDS},
  "conversation": ${conversationOf("^")}{ ${CONVERSATION_FIELDS} },
  "other": *[_type == "conversationMember" && conversationId == ^.conversationId && userKey != $key && ${PUBLISHED}][0]{ ${MEMBER_FIELDS} },
  "last": *[_type == "message" && conversationId == ^.conversationId && ${PUBLISHED}] | order(createdAt desc, _id desc) [0]{ ${MESSAGE_FIELDS} },
  "unread": count(${UNREAD})
}`;

export const CONVERSATIONS_QUERY = `${DIRECT_MEMBERSHIPS} ${CONVERSATION_PROJECTION}`;

/** `$memberId`: the viewer's private membership id. */
export const CONVERSATION_QUERY = `*[_type == "conversationMember" && _id == $memberId && userKey == $key && ${PUBLISHED}][0] ${CONVERSATION_PROJECTION}`;

/** How many direct conversations have something `$key` hasn't read. */
export const UNREAD_CONVERSATIONS_QUERY = `count(${DIRECT_MEMBERSHIPS}{ "unread": count(${UNREAD}[0...1]) }[unread > 0])`;

/**
 * A conversation, the viewer's membership (with `_rev`, for read markers)
 * and, for direct conversations, the other member.
 */
export const ACCESS_QUERY = `{
  "conversation": *[_type == "conversation" && _id == $id && ${PUBLISHED}][0]{ ${CONVERSATION_FIELDS} },
  "member": *[_type == "conversationMember" && _id == $memberId && ${PUBLISHED}][0]{ ${MEMBER_FIELDS}, _rev },
  "other": *[_type == "conversationMember" && conversationId == $conversationId && userKey != $key && ${PUBLISHED}][0]{ ${MEMBER_FIELDS} }
}`;

/** A message with the fingerprint of the request that wrote it ("" for none). */
export const MESSAGE_QUERY = `*[_type == "message" && _id == $id && ${PUBLISHED}][0]{ ${MESSAGE_FIELDS}, "requestHash": coalesce(requestHash, "") }`;

const BEFORE = `(dateTime(createdAt) < dateTime($beforeCreatedAt) || (dateTime(createdAt) == dateTime($beforeCreatedAt) && _id < $beforeId))`;
const AFTER = `(dateTime(createdAt) > dateTime($afterCreatedAt) || (dateTime(createdAt) == dateTime($afterCreatedAt) && _id > $afterId))`;

/**
 * A page of `$conversationId`, by (createdAt, id) like the memory store:
 * newest first, or oldest first after a cursor. `fetchCount` is a
 * validated integer (page size + 1 to see whether more exist).
 */
export const messagesPageQuery = (
  cursors: { before: boolean; after: boolean },
  fetchCount: number
) =>
  `*[_type == "message" && conversationId == $conversationId${
    cursors.before ? ` && ${BEFORE}` : ""
  }${cursors.after ? ` && ${AFTER}` : ""} && ${PUBLISHED}] | order(${
    cursors.after ? "createdAt asc, _id asc" : "createdAt desc, _id desc"
  }) [0...${fetchCount}] { ${MESSAGE_FIELDS} }`;

/** What a page of messages points at: payment requests and visible Tweets. */
export const REFS_QUERY = `{
  "requests": *[_type == "paymentRequest" && _id in $requestIds && ${PUBLISHED}]{ ${REQUEST_FIELDS} },
  "tweets": *[${TWEET_FILTER} && _id in $tweetIds && ${PUBLISHED}]{ "id": _id, "text": coalesce(tweet, ""), "author": { "username": username, "fullname": coalesce(fullname, username), "image": userImage } }
}`;

/** Whether a Tweet can be shared: it exists and isn't moderated. */
export const TWEET_EXISTS_QUERY = `count(*[${TWEET_FILTER} && _id == $id && ${PUBLISHED}]) > 0`;
