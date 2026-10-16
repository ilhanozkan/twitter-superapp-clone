import { SeedData } from "../../seed";
import { storyDocument, storyViewDocument } from "../stories";
import { SanitySeedDocument } from "./documents";

// Stories are public documents; their views are private (path ids), so
// importing the views needs a token (see sanity/README.md).

export function storiesSanityDocuments(seed: SeedData): SanitySeedDocument[] {
  const stories = seed.superapp?.stories;
  if (!stories) return [];

  return [
    ...stories.stories.map((story) => ({
      ...storyDocument(story),
      _createdAt: story.createdAt,
    })),
    ...stories.views.map((view) => ({
      ...storyViewDocument(view),
      _createdAt: view.createdAt,
    })),
  ];
}
