import { defineField, defineType } from "sanity";

import { imageUrl, username } from "./rules";

/**
 * Likes, retweets and bookmarks are one document per (tweet, user). The app
 * creates them with deterministic ids (`like-<tweetId>-<username>`), which is
 * what makes reacting idempotent, so they are not created from the Studio
 * (see newDocumentOptions in sanity.config.ts).
 */
function reactionType(name: string, title: string, verb: string) {
  return defineType({
    name,
    title,
    type: "document",
    fields: [
      defineField({
        name: "tweet",
        title: "Tweet",
        type: "reference",
        to: [{ type: "tweet" }],
        // Weak: deleting a tweet must never be blocked by its reactions.
        weak: true,
        validation: (rule) => rule.required(),
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
      }),
      defineField({
        name: "userImage",
        title: "Profile image",
        type: "url",
        validation: imageUrl,
      }),
    ],
    preview: {
      select: { username: "username", tweet: "tweet.tweet" },
      prepare({ username, tweet }) {
        return {
          title: `@${username ?? "unknown"} ${verb}`,
          subtitle: tweet ?? "(deleted tweet)",
        };
      },
    },
  });
}

export const likeType = reactionType("like", "Like", "liked");
export const retweetType = reactionType("retweet", "Retweet", "retweeted");
export const bookmarkType = reactionType("bookmark", "Bookmark", "bookmarked");

export const REACTION_TYPES = [
  likeType.name,
  retweetType.name,
  bookmarkType.name,
];
