import { z } from "zod";

import { createHandler } from "../../../lib/api/handler";
import { limitParam, parseQuery } from "../../../lib/api/validation";
import { DEFAULT_USER_SEARCH_LIMIT } from "../../../lib/constants";
import { getRepository } from "../../../lib/db";
import { UsersResponse } from "../../../types/Api";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

const query = z.object({
  q: z
    .string({ error: "q is required" })
    .trim()
    .min(1, "q is required")
    .max(50, "q must be at most 50 characters"),
  limit: limitParam(20),
});

export default createHandler({
  // GET /api/users?q=&limit= — people whose username or name matches every
  // word, by username (the recipient picker).
  async GET(req, res) {
    const { q, limit = DEFAULT_USER_SEARCH_LIMIT } = parseQuery(req, query);
    const body: UsersResponse = {
      items: await getRepository().searchUsers(q, limit),
    };

    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json(body);
  },
});
