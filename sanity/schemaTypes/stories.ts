import { defineField, defineType } from "sanity";
import type { StructureBuilder } from "sanity/structure";

import { apiVersion, LIMITS } from "../env";
import {
  newestFirst,
  partyField,
  timestampField,
  usernameKeyField,
} from "./fields";
import { imageUrl, maxLength } from "./rules";

// Stories (docs/features/stories.md). The app creates every story and its
// views; a story disappears 24 hours after it was posted. Moderators can only
// block a story (it then disappears at once) or unblock it: every other
// field is read-only, and stories can't be created, duplicated or deleted
// here. Views are private documents ("private." ids) that only the app
// reads, so they are locked and left off the desk.

/** lib/superapp/stories.ts STORY_BACKGROUNDS; lib/db/stories/rules.test.ts keeps the two equal. */
export const STORY_BACKGROUNDS: readonly { value: string; title: string }[] = [
  { value: "blue", title: "Blue" },
  { value: "purple", title: "Purple" },
  { value: "green", title: "Green" },
  { value: "orange", title: "Orange" },
  { value: "pink", title: "Pink" },
  { value: "slate", title: "Slate" },
];

const storyType = defineType({
  name: "story",
  title: "Story",
  type: "document",
  fields: [
    defineField({
      name: "blocked",
      title: "Blocked",
      description:
        "Hides the story everywhere in the app at once. Publish to apply.",
      type: "boolean",
      initialValue: false,
    }),
    { ...partyField("author", "Author"), readOnly: true },
    { ...usernameKeyField("authorKey", "Author (key)"), readOnly: true },
    defineField({
      name: "contentType",
      title: "Kind",
      type: "string",
      options: {
        list: [
          { title: "Text", value: "text" },
          { title: "Photo", value: "image" },
        ],
      },
      readOnly: true,
    }),
    defineField({
      name: "text",
      title: "Text",
      type: "text",
      rows: 3,
      readOnly: true,
      hidden: ({ document }) => document?.contentType !== "text",
      validation: (rule) => maxLength(rule, LIMITS.stories.textMax),
    }),
    defineField({
      name: "background",
      title: "Background",
      type: "string",
      options: { list: [...STORY_BACKGROUNDS] },
      readOnly: true,
      hidden: ({ document }) => document?.contentType !== "text",
    }),
    defineField({
      name: "image",
      title: "Image",
      type: "url",
      readOnly: true,
      hidden: ({ document }) => document?.contentType !== "image",
      validation: imageUrl,
    }),
    defineField({
      name: "imageAlt",
      title: "Alt text",
      type: "text",
      rows: 2,
      readOnly: true,
      hidden: ({ document }) => document?.contentType !== "image",
      validation: (rule) => maxLength(rule, LIMITS.stories.altMax),
    }),
    defineField({
      name: "caption",
      title: "Caption",
      type: "string",
      readOnly: true,
      hidden: ({ document }) => document?.contentType !== "image",
      validation: (rule) => maxLength(rule, LIMITS.stories.captionMax),
    }),
    { ...timestampField("createdAt", "Posted"), readOnly: true },
    { ...timestampField("expiresAt", "Disappears"), readOnly: true },
  ],
  orderings: [newestFirst],
  preview: {
    select: {
      username: "author.username",
      text: "text",
      caption: "caption",
      alt: "imageAlt",
      blocked: "blocked",
    },
    prepare({ username, text, caption, alt, blocked }) {
      return {
        title: text || caption || alt || "Story",
        subtitle: `@${username ?? "unknown"}${blocked ? " · Blocked" : ""}`,
      };
    },
  },
});

const storyViewType = defineType({
  name: "storyView",
  title: "Story view",
  type: "document",
  readOnly: true,
  fields: [
    defineField({
      name: "story",
      title: "Story",
      description: "A weak reference: deleting the story never waits for it.",
      type: "reference",
      to: [{ type: "story" }],
      weak: true,
    }),
    defineField({ name: "storyId", title: "Story id", type: "string" }),
    defineField({ name: "username", title: "Viewer", type: "string" }),
    defineField({ name: "fullname", title: "Full name", type: "string" }),
    defineField({
      name: "image",
      title: "Profile image",
      type: "url",
      validation: imageUrl,
    }),
    usernameKeyField("userKey", "Viewer (key)"),
    timestampField("createdAt", "Seen"),
  ],
  orderings: [newestFirst],
  preview: {
    select: { username: "username", storyId: "storyId" },
    prepare({ username, storyId }) {
      return {
        title: `@${username ?? "unknown"}`,
        subtitle: `Saw ${storyId ?? "a story"}`,
      };
    },
  },
});

export const types = [storyType, storyViewType];

/** The "Stories" group: Stories, Blocked stories. */
export function structureItems(S: StructureBuilder) {
  return [
    S.listItem()
      .title("Stories")
      .schemaType("story")
      .child(
        S.documentTypeList("story")
          .title("Stories")
          .defaultOrdering([{ field: "createdAt", direction: "desc" }])
      ),
    S.listItem()
      .title("Blocked stories")
      .schemaType("story")
      .child(
        S.documentList()
          .title("Blocked stories")
          .apiVersion(apiVersion)
          .schemaType("story")
          .filter('_type == "story" && blocked == true')
          .defaultOrdering([{ field: "createdAt", direction: "desc" }])
      ),
  ];
}

export const APP_CREATED_TYPES = ["story", "storyView"];
export const LOCKED_TYPES = ["storyView"];
export const MODERATED_TYPES = ["story"];
