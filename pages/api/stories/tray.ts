import { createHandler } from "../../../lib/api/handler";
import { getCurrentUsername } from "../../../lib/auth";
import { getRepository } from "../../../lib/db";
import { StoryTrayResponse } from "../../../types/Story";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

export default createHandler(
  {
    // GET /api/stories/tray — Home's tray: your story, then unseen, then seen
    async GET(_req, res) {
      const body: StoryTrayResponse = {
        items: await getRepository().stories.listTray(getCurrentUsername()),
      };

      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json(body);
    },
  },
  { feature: "stories" }
);
