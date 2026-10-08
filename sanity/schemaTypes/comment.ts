import { defineField, defineType } from "sanity";

import { imageUrl, tweetText, username } from "./rules";

// Shown as "Replies" in the app. The document type stays "comment" for
// compatibility with existing data.
export const commentType = defineType({
  name: "comment",
  title: "Reply",
  type: "document",
  fields: [
    defineField({
      name: "comment",
      title: "Reply",
      type: "text",
      rows: 3,
      validation: tweetText,
    }),
    defineField({
      name: "username",
      title: "Username",
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
      name: "profileImg",
      title: "Profile image",
      type: "url",
      validation: imageUrl,
    }),
    defineField({
      name: "tweet",
      title: "Tweet",
      description: "The tweet this replies to.",
      type: "reference",
      to: [{ type: "tweet" }],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "likes",
      title: "Comment likes",
      type: "string",
      hidden: true,
      deprecated: {
        reason:
          "Never used by the app. Kept so older documents still validate.",
      },
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
    select: { text: "comment", username: "username", tweet: "tweet.tweet" },
    prepare({ text, username, tweet }) {
      return {
        title: text || "(empty reply)",
        subtitle: `@${username ?? "unknown"}${tweet ? ` → ${tweet}` : ""}`,
      };
    },
  },
});
