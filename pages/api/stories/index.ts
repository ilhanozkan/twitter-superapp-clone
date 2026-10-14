import { assertActorLimit } from "../../../lib/api/actorLimits";
import { notFound } from "../../../lib/api/errors";
import { createHandler } from "../../../lib/api/handler";
import {
  createStoryBody,
  storiesQuery,
  storyLocation,
} from "../../../lib/api/stories";
import { parseBody, parseQuery } from "../../../lib/api/validation";
import { getCurrentUser, getCurrentUsername } from "../../../lib/auth";
import { getRepository } from "../../../lib/db";
import { StoriesResponse, StoryResponse } from "../../../types/Story";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default createHandler(
  {
    // GET /api/stories?author=username — their visible stories, oldest first
    async GET(req, res) {
      const { author } = parseQuery(req, storiesQuery);
      const repo = getRepository();
      const items = await repo.stories.listStories(
        author,
        getCurrentUsername()
      );
      // An account with nothing posted lists no stories; an unknown one is 404.
      if (items.length === 0 && !(await repo.getUser(author))) {
        throw notFound("User not found");
      }

      const body: StoriesResponse = { items };
      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json(body);
    },

    // POST /api/stories { content } — the current user posts a story for 24 hours
    async POST(req, res) {
      const { content } = parseBody(req, createStoryBody);
      const author = await getCurrentUser();
      assertActorLimit("stories", author.username);

      const body: StoryResponse = {
        story: await getRepository().stories.createStory({ author, content }),
      };
      res.setHeader("Location", storyLocation(body.story));
      res.status(201).json(body);
    },
  },
  { feature: "stories" }
);
