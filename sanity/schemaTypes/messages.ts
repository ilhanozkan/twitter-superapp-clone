import {
  type ConditionalPropertyCallbackContext,
  defineField,
  defineType,
} from "sanity";
import type { StructureBuilder } from "sanity/structure";

import { apiVersion, KEY_PATTERN, LIMITS } from "../env";
import {
  centsField,
  formatCredits,
  newestFirst,
  partyField,
  requestHashField,
  timestampField,
  usernameKeyField,
} from "./fields";
import { maxLength } from "./rules";

// Conversations, their members and their messages. All three are private
// documents ("private." ids) that the app writes. Direct conversations are
// never listed in the desk: only channels and removed channel messages
// are. That is a convenience, not a protection: direct messages are stored
// unencrypted, so anyone with access to the dataset can read them (see
// sanity/README.md).

const CHANNELS = '_type == "conversation" && kind == "channel"';
const REMOVED_CHANNEL_MESSAGES =
  '_type == "message" && defined(removed) && string::startsWith(conversationId, "channel-")';

const isDirect = ({ document }: ConditionalPropertyCallbackContext) =>
  document?.kind !== "channel";

/** A string the app writes and moderators only read. */
const fixedString = (name: string, title: string) =>
  defineField({ name, title, type: "string", readOnly: true });

// Moderated: only a channel's name and description can be edited (and
// published); everything else is the app's.
const conversationType = defineType({
  name: "conversation",
  title: "Conversation",
  type: "document",
  fields: [
    defineField({
      name: "kind",
      title: "Kind",
      type: "string",
      readOnly: true,
      options: {
        list: [
          { value: "direct", title: "Direct" },
          { value: "channel", title: "Channel" },
        ],
      },
    }),
    defineField({
      name: "handle",
      title: "Handle",
      type: "string",
      readOnly: true,
      hidden: isDirect,
    }),
    defineField({
      name: "name",
      title: "Name",
      type: "string",
      hidden: isDirect,
      validation: (rule) => maxLength(rule, LIMITS.channels.nameMax),
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "text",
      rows: 3,
      hidden: isDirect,
      validation: (rule) => maxLength(rule, LIMITS.channels.descriptionMax),
    }),
    { ...partyField("owner", "Owner"), readOnly: true, hidden: isDirect },
    { ...timestampField("createdAt", "Created"), readOnly: true },
  ],
  orderings: [newestFirst],
  preview: {
    select: { kind: "kind", handle: "handle", name: "name" },
    prepare({ kind, handle, name }) {
      return kind === "channel"
        ? { title: name || `#${handle ?? "channel"}`, subtitle: `#${handle}` }
        : { title: "Direct conversation", subtitle: "Private" };
    },
  },
});

// Locked and hidden: who is in a conversation and how far they have read.
const conversationMemberType = defineType({
  name: "conversationMember",
  title: "Conversation member",
  type: "document",
  readOnly: true,
  fields: [
    defineField({
      name: "conversationId",
      title: "Conversation",
      type: "string",
      validation: (rule) => rule.regex(KEY_PATTERN),
    }),
    defineField({ name: "username", title: "Username", type: "string" }),
    defineField({ name: "fullname", title: "Full name", type: "string" }),
    defineField({ name: "image", title: "Profile image", type: "url" }),
    usernameKeyField("userKey", "Username (key)"),
    defineField({
      name: "role",
      title: "Role",
      type: "string",
      options: { list: ["owner", "moderator", "member"] },
    }),
    timestampField("joinedAt", "Joined"),
    timestampField("lastReadAt", "Last read"),
  ],
  preview: {
    select: { username: "username", conversation: "conversationId" },
    prepare({ username, conversation }) {
      return { title: `@${username ?? "unknown"}`, subtitle: conversation };
    },
  },
});

// Moderated: `removed` is the only field a moderator can change.
const messageType = defineType({
  name: "message",
  title: "Message",
  type: "document",
  fields: [
    defineField({
      name: "removed",
      title: "Removed",
      description:
        "Hides the message's content for everyone; the app shows that it was removed.",
      type: "string",
      options: {
        list: [
          { value: "moderator", title: "By a moderator" },
          { value: "author", title: "By its author" },
        ],
        layout: "radio",
      },
    }),
    fixedString("conversationId", "Conversation"),
    { ...partyField("author", "Author"), readOnly: true },
    { ...usernameKeyField("authorKey", "Author (key)"), readOnly: true },
    defineField({
      name: "bodyType",
      title: "Kind",
      type: "string",
      readOnly: true,
      options: { list: ["text", "payment", "request"] },
    }),
    defineField({
      name: "text",
      title: "Text",
      type: "text",
      rows: 4,
      readOnly: true,
      validation: (rule) => maxLength(rule, LIMITS.messageMax),
    }),
    fixedString("tweetId", "Shared Tweet"),
    fixedString("storyId", "Story replied to"),
    {
      ...partyField(
        "storyAuthor",
        "Story author",
        "Kept so a reply still says whose story it was after the story expires."
      ),
      readOnly: true,
    },
    { ...centsField("amount", "Amount"), readOnly: true },
    fixedString("note", "Note"),
    fixedString("transferId", "Payment"),
    fixedString("requestId", "Payment request"),
    { ...timestampField("createdAt", "Sent"), readOnly: true },
    requestHashField,
  ],
  orderings: [newestFirst],
  preview: {
    select: {
      author: "author.username",
      bodyType: "bodyType",
      text: "text",
      amount: "amount",
      removed: "removed",
    },
    prepare({ author, bodyType, text, amount, removed }) {
      const body =
        bodyType === "payment"
          ? `Sent ${formatCredits(amount)}`
          : bodyType === "request"
            ? `Requested ${formatCredits(amount)}`
            : text || "Shared a Tweet";
      return {
        title: removed ? `Removed · ${body}` : body,
        subtitle: `@${author ?? "unknown"}`,
      };
    },
  },
});

export const types = [conversationType, conversationMemberType, messageType];

/** The "Channels" group: Channels, Removed messages. */
export function structureItems(S: StructureBuilder) {
  const list = (title: string, type: string, filter: string) =>
    S.listItem()
      .title(title)
      .schemaType(type)
      .child(
        S.documentList()
          .title(title)
          .apiVersion(apiVersion)
          .schemaType(type)
          .filter(filter)
          .defaultOrdering([{ field: "createdAt", direction: "desc" }])
      );

  return [
    list("Channels", "conversation", CHANNELS),
    list("Removed messages", "message", REMOVED_CHANNEL_MESSAGES),
  ];
}

export const APP_CREATED_TYPES = [
  "conversation",
  "conversationMember",
  "message",
];
export const LOCKED_TYPES = ["conversationMember"];
export const MODERATED_TYPES = ["conversation", "message"];
