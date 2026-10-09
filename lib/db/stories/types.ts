import { IStory, IStoryTrayItem, StoryContent } from "../../../types/Story";
import { IAuthor } from "../../../types/User";
import { FeatureRepository } from "../types";

// Skeleton declared by the foundation; the stories lane implements it.

export interface NewStory {
  author: IAuthor;
  content: StoryContent;
}

export interface StoriesRepository extends FeatureRepository {
  /** F-declared (Home SSR); stub []. */
  listTray(viewer: string | null): Promise<IStoryTrayItem[]>;
  /** F-declared (B1 reply validation and preview); null if missing, expired or blocked; stub null. */
  getStory(id: string, viewer: string | null): Promise<IStory | null>;
  /** Active, oldest first. */
  listStories(author: string, viewer: string | null): Promise<IStory[]>;
  /** LimitExceededError (10 active). Deletes the author's expired stories in the same write. */
  createStory(input: NewStory): Promise<IStory>;
  deleteStory(id: string): Promise<boolean>;
  /** Idempotent; ignores expired/unknown ids. */
  markSeen(storyIds: string[], viewer: IAuthor): Promise<void>;
  /** The author's own views excluded. */
  listViewers(storyId: string): Promise<IAuthor[]>;
}
