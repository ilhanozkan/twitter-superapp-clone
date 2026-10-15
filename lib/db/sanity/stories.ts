import { StoriesRepository } from "../stories/types";
import { unbuiltStories } from "../stubs";
import { SanityDeps } from "./deps";

// Stub: the stories lane replaces this file. Its documents are public, so it
// stays readable without a token.

export const createSanityStories: (
  deps: SanityDeps
) => StoriesRepository = () => unbuiltStories(true);
