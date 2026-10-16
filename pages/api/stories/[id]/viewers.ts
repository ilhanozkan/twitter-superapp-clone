import { notFound } from "../../../../lib/api/errors";
import { createHandler } from "../../../../lib/api/handler";
import { visibleStory } from "../../../../lib/api/stories";
import { routeKey } from "../../../../lib/api/validation";
import { getCurrentUsername } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/db";
import { canViewViewers } from "../../../../lib/superapp/policy/stories";
import { StoryViewersResponse } from "../../../../types/Story";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

export default createHandler(
  {
    // GET /api/stories/:id/viewers — who saw it, most recent first. Only
    // the author may ask; for everyone else the story's viewers don't exist.
    async GET(req, res) {
      const id = routeKey(req, "id", "Story not found");
      const viewer = getCurrentUsername();
      if (!canViewViewers(viewer, await visibleStory(id, viewer))) {
        throw notFound("Story not found");
      }

      const body: StoryViewersResponse = {
        items: await getRepository().stories.listViewers(id),
      };
      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json(body);
    },
  },
  { feature: "stories" }
);
