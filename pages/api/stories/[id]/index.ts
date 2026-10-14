import { forbidden } from "../../../../lib/api/errors";
import { createHandler } from "../../../../lib/api/handler";
import { visibleStory } from "../../../../lib/api/stories";
import { routeKey } from "../../../../lib/api/validation";
import { getCurrentUsername } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/db";
import { canDeleteStory } from "../../../../lib/superapp/policy/stories";
import { StoryResponse } from "../../../../types/Story";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

export default createHandler(
  {
    // Expired and blocked stories are gone: 404 like unknown ids.
    async GET(req, res) {
      const id = routeKey(req, "id", "Story not found");
      const body: StoryResponse = {
        story: await visibleStory(id, getCurrentUsername()),
      };

      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json(body);
    },

    // Only the author may delete a story; its views go with it.
    async DELETE(req, res) {
      const id = routeKey(req, "id", "Story not found");
      const viewer = getCurrentUsername();
      if (!canDeleteStory(viewer, await visibleStory(id, viewer))) {
        throw forbidden("You can only delete your own stories");
      }

      await getRepository().stories.deleteStory(id);
      res.status(204).end();
    },
  },
  { feature: "stories" }
);
