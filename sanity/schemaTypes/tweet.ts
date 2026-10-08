import { defineField, defineType } from "sanity";

import { imageUrl, tweetText, username } from "./rules";

// Field names are unchanged from the original schema so existing documents
// stay valid; only types (string -> text/url) and validation were tightened.
export const tweetType = defineType({
  name: "tweet",
  title: "Tweet",
  type: "document",
  fields: [
    defineField({
      name: "tweet",
      title: "Tweet message",
      type: "text",
      rows: 4,
      validation: tweetText,
    }),
    defineField({
      name: "username",
      title: "Username",
      description: "Handle of the author, without the @.",
      type: "string",
      validation: username,
    }),
    defineField({
      name: "fullname",
      title: "Full name",
      type: "string",
      validation: (rule) => rule.required().max(50),
    }),
    defineField({
      name: "userImage",
      title: "Author's profile image",
      type: "url",
      validation: imageUrl,
    }),
    defineField({
      name: "tweetImage",
      title: "Tweet image",
      type: "url",
      validation: imageUrl,
    }),
    defineField({
      name: "blockTweet",
      title: "Block tweet",
      description: "Hide this tweet from every timeline (moderation).",
      type: "boolean",
      initialValue: false,
    }),
  ],
  orderings: [
    {
      title: "Newest first",
      name: "createdAtDesc",
      by: [{ field: "_createdAt", direction: "desc" }],
    },
  ],
  preview: {
    select: { text: "tweet", username: "username", blocked: "blockTweet" },
    prepare({ text, username, blocked }) {
      return {
        title: text || "(empty tweet)",
        subtitle: `@${username ?? "unknown"}${blocked ? " · blocked" : ""}`,
      };
    },
  },
});
