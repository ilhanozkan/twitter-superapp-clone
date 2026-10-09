import { IAuthor } from "./User";

// Skeleton declared by the foundation; the stories lane completes it.

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
}
