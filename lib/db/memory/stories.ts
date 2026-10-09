import { StoriesRepository } from "../stories/types";
import { StoriesSeed } from "../seeds/stories";
import { unbuiltStories } from "../stubs";
import { MemoryDeps } from "./deps";

// Stub: the stories lane replaces this file.

export type StoriesMemoryState = Record<string, never>;

export const createStoriesMemoryState: (
  seed: StoriesSeed | null
) => StoriesMemoryState = () => ({});

export const createMemoryStories: (
  deps: MemoryDeps
) => StoriesRepository = () => unbuiltStories(true);
