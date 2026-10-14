import { z } from "zod";

import { getRepository } from "../db";
import {
  SEEN_BATCH_MAX,
  STORY_BACKGROUND_IDS,
  STORY_LIMITS,
} from "../superapp/stories";
import { IStory } from "../../types/Story";
import { notFound } from "./errors";
import { imageUrl, plainText, recordKey, username } from "./validation";

// Request schemas and shared steps of the stories routes. The author and
// the viewer always come from lib/auth.ts; unknown body fields (author,
// username...) are dropped by the schemas.

const textStory = z.object({
  type: z.literal("text"),
  text: plainText({ max: STORY_LIMITS.textMax }),
  background: z.enum(STORY_BACKGROUND_IDS, {
    error: `Background must be one of ${STORY_BACKGROUND_IDS.join(", ")}`,
  }),
});

const imageStory = z.object({
  type: z.literal("image"),
  // The same rule as Tweet images: an https URL or a path on this site.
  image: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Image is required" : "Invalid image URL",
    })
    .pipe(imageUrl),
  // Required: image stories are described for people who use screen readers.
  alt: plainText({ max: STORY_LIMITS.altMax, label: "Alt text" }),
  caption: plainText({
    max: STORY_LIMITS.captionMax,
    allowEmpty: true,
    label: "Caption",
  })
    .nullish()
    .transform((caption) => caption || null),
});

export const storyContent = z.discriminatedUnion(
  "type",
  [textStory, imageStory],
  {
    error: (issue) =>
      issue.input === undefined
        ? "Content is required"
        : 'Content must be a "text" or an "image" story',
  }
);

export const createStoryBody = z.object({ content: storyContent });

export const storiesQuery = z.object({ author: username });

export const storyViewsBody = z.object({
  ids: z
    .array(recordKey("Story id"), {
      error: (issue) =>
        issue.input === undefined ? "ids is required" : "ids must be a list",
    })
    .min(1, "Send at least one story id")
    .max(SEEN_BATCH_MAX, `Send at most ${SEEN_BATCH_MAX} story ids at once`),
});

/** A story the viewer can see: missing, expired and blocked ones are all 404. */
export async function visibleStory(
  id: string,
  viewer: string
): Promise<IStory> {
  const story = await getRepository().stories.getStory(id, viewer);
  if (!story) throw notFound("Story not found");
  return story;
}

export const storyLocation = (story: IStory) =>
  `/api/stories/${encodeURIComponent(story.id)}`;
