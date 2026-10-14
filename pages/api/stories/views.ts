import { createHandler } from "../../../lib/api/handler";
import { storyViewsBody } from "../../../lib/api/stories";
import { parseBody } from "../../../lib/api/validation";
import { getCurrentUser } from "../../../lib/auth";
import { getRepository } from "../../../lib/db";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default createHandler(
  {
    // POST /api/stories/views { ids } — marks up to 50 stories seen by the
    // current user. Idempotent; unknown, expired and blocked ids are ignored.
    async POST(req, res) {
      const { ids } = parseBody(req, storyViewsBody);
      await getRepository().stories.markSeen(ids, await getCurrentUser());
      res.status(204).end();
    },
  },
  { feature: "stories" }
);
