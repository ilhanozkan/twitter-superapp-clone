import { PUBLISHED } from "./groq";

// GROQ for stories (public documents, readable without a token) and story
// views (private: "private." ids). Every query follows the SuperApp rules in
// ./groq: typed, PUBLISHED, `$now` from the app clock, values as params.
// `$viewer` is a lower-cased username, or "" for nobody.

/** Shown: not blocked by a moderator, and not yet expired at `$now`. */
const VISIBLE = `blocked != true && dateTime(expiresAt) > dateTime($now)`;

const EXPIRED = `dateTime(expiresAt) <= dateTime($now)`;

const viewsOf = (story: string, extra = "") =>
  `*[_type == "storyView" && storyId == ${story}${extra} && ${PUBLISHED}]`;

/**
 * A story document as `storyFromRow` reads it, with whether `$viewer` has
 * seen it and, on the viewer's own stories, how many others have.
 */
const STORY_FIELDS = `
  "id": _id,
  "author": author{ "username": username, "fullname": coalesce(fullname, username), "image": image },
  contentType, text, background, image, imageAlt, caption, createdAt, expiresAt,
  "blocked": blocked == true,
  "seen": count(${viewsOf("^._id", " && userKey == $viewer")}) > 0,
  "views": select(authorKey == $viewer => count(${viewsOf("^._id", " && userKey != ^.authorKey")}))
`;

export const VISIBLE_STORIES_QUERY = `*[_type == "story" && ${VISIBLE} && ${PUBLISHED}] | order(createdAt asc, _id asc) {${STORY_FIELDS}}`;

export const AUTHOR_STORIES_QUERY = `*[_type == "story" && authorKey == $author && ${VISIBLE} && ${PUBLISHED}] | order(createdAt asc, _id asc) {${STORY_FIELDS}}`;

export const STORY_QUERY = `*[_type == "story" && _id == $id && ${VISIBLE} && ${PUBLISHED}][0]{${STORY_FIELDS}}`;

/** What creating a story needs: the author's visible count, and their expired stories with the views of each (to delete). */
export const CREATE_STORY_QUERY = `{
  "active": count(*[_type == "story" && authorKey == $key && ${VISIBLE} && ${PUBLISHED}]),
  "expired": *[_type == "story" && authorKey == $key && ${EXPIRED} && ${PUBLISHED}]{
    "id": _id,
    "views": ${viewsOf("^._id")}._id
  }
}`;

/** A story in any state, and its views. */
export const DELETE_STORY_QUERY = `{
  "id": *[_type == "story" && _id == $id && ${PUBLISHED}][0]._id,
  "views": ${viewsOf("$id")}._id
}`;

/** Which of `$ids` are visible, and which of those `$viewer` has already seen. */
export const MARK_SEEN_QUERY = `{
  "visible": *[_type == "story" && _id in $ids && ${VISIBLE} && ${PUBLISHED}]._id,
  "seen": *[_type == "storyView" && userKey == $viewer && storyId in $ids && ${PUBLISHED}].storyId
}`;

/** Who saw a visible story, most recent first, without its author; null for a story that isn't shown. */
export const VIEWERS_QUERY = `*[_type == "story" && _id == $id && ${VISIBLE} && ${PUBLISHED}][0]{
  "viewers": ${viewsOf(
    "^._id",
    " && userKey != ^.authorKey"
  )} | order(createdAt desc, userKey asc) { "username": username, "fullname": coalesce(fullname, username), "image": image }
}`;
