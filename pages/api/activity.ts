import { z } from "zod";

import { createHandler } from "../../lib/api/handler";
import { parseQuery } from "../../lib/api/validation";
import { getCurrentUsername } from "../../lib/auth";
import { getRepository } from "../../lib/db";
import { loadActivity } from "../../lib/server/activity";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

const query = z.object({
  since: z.iso
    .datetime({ offset: true, error: "since must be an ISO date and time" })
    .optional(),
});

export default createHandler({
  // GET /api/activity?since=ISO — badge counts and live activity, polled by
  // the shell. `since` is when this device last opened Notifications.
  async GET(req, res) {
    const { since } = parseQuery(req, query);
    const body = await loadActivity(getRepository(), getCurrentUsername(), {
      since,
    });

    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json(body);
  },
});
