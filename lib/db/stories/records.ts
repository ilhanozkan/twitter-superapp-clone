import { compareKeys } from "../../superapp/stories";
import { IStory, StoryContent } from "../../../types/Story";
import { IAuthor } from "../../../types/User";

// Stories and views as both stores keep them. The author and the viewer are
// snapshots taken when the record was written, like a Tweet's author.

export interface StoryRecord {
  /** "story-<generated>" (seeds: "seed-storyNN"); never "tray" or "views", which are routes. */
  id: string;
  author: IAuthor;
  content: StoryContent;
  createdAt: string;
  expiresAt: string;
  /** Set by a moderator in Studio; a blocked story is hidden everywhere. */
  blocked: boolean;
}

/** One per story and viewer: marking a story seen again changes nothing. */
export interface StoryViewRecord {
  storyId: string;
  viewer: IAuthor;
  createdAt: string;
}

const lower = (username: string) => username.toLowerCase();

/** A view's key. Usernames never contain "-", so it can't be ambiguous. */
export function storyViewKey(storyId: string, username: string): string {
  return `storyview-${storyId}-${lower(username)}`;
}

export const isAuthorOf = (viewer: string | null, record: StoryRecord) =>
  !!viewer && lower(viewer) === lower(record.author.username);

export const toAuthor = ({ username, fullname, image }: IAuthor): IAuthor => ({
  username,
  fullname,
  image,
});

export function copyContent(content: StoryContent): StoryContent {
  return content.type === "text"
    ? { type: "text", text: content.text, background: content.background }
    : {
        type: "image",
        image: content.image,
        alt: content.alt,
        caption: content.caption,
      };
}

/**
 * A story as `viewer` sees it. `views` counts everyone but the author who
 * saw it, and only the author gets it.
 */
export function toStory(
  record: StoryRecord,
  viewer: string | null,
  { seen, views }: { seen: boolean; views: number | null }
): IStory {
  return {
    id: record.id,
    author: toAuthor(record.author),
    content: copyContent(record.content),
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    viewer: { seen },
    views: isAuthorOf(viewer, record) ? (views ?? 0) : null,
  };
}

/** Who saw a story: most recent first; ties by username. */
export function compareViews(a: StoryViewRecord, b: StoryViewRecord): number {
  return (
    Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
    compareKeys(lower(a.viewer.username), lower(b.viewer.username))
  );
}
