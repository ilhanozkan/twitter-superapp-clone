import { IAuthor } from "./User";

// The story types are the foundation's contract (B1 previews stories in
// messages); the stories lane adds the API's response bodies.

export type StoryBackground =
  "blue" | "purple" | "green" | "orange" | "pink" | "slate";

export type StoryContent =
  | { type: "text"; text: string; background: StoryBackground }
  | { type: "image"; image: string; alt: string; caption: string | null };

export interface IStory {
  id: string;
  author: IAuthor;
  content: StoryContent;
  createdAt: string;
  expiresAt: string;
  viewer: { seen: boolean };
  /** Only on the author's own stories. */
  views: number | null;
}

export interface IStoryTrayItem {
  author: IAuthor;
  storyIds: string[];
  latestAt: string;
  hasUnseen: boolean;
  firstUnseenId: string | null;
  /**
   * The stories the viewer hasn't seen, oldest first (added by the stories
   * lane): a later story can be seen before an earlier one, e.g. through a
   * link, so they aren't always the ones from `firstUnseenId` on.
   */
  unseenIds: string[];
}

// Response bodies of /api/stories/** (docs/api/stories.md).

export interface StoryTrayResponse {
  items: IStoryTrayItem[];
}

export interface StoriesResponse {
  items: IStory[];
}

export interface StoryResponse {
  story: IStory;
}

export interface StoryViewersResponse {
  items: IAuthor[];
}
