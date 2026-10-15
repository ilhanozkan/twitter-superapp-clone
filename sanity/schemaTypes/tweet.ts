import { defineField, defineType } from "sanity";

import { KEY_PATTERN } from "../env";
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
      name: "attachment",
      title: "Attachment",
      description:
        "A product card shown under the tweet (shown only while the shop is on). Any account can attach any product, like sharing a link.",
      type: "object",
      fields: [
        defineField({
          name: "kind",
          title: "Kind",
          type: "string",
          options: { list: [{ title: "Product", value: "product" }] },
          initialValue: "product",
          validation: (rule) => rule.required(),
        }),
        defineField({
          name: "productId",
          title: "Product id",
          description: "The id of a product document, such as seed-p-kk-latte.",
          type: "string",
          validation: (rule) =>
            rule.required().regex(KEY_PATTERN, {
              name: "id (letters, digits, - and _)",
            }),
        }),
      ],
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
