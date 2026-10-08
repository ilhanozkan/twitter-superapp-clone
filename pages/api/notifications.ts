import { createHandler } from "../../lib/api/handler";
import { limitQuery, parseQuery } from "../../lib/api/validation";
import { getCurrentUsername } from "../../lib/auth";
import { getRepository } from "../../lib/db";

const query = limitQuery();

export default createHandler({
  async GET(req, res) {
    const { limit } = parseQuery(req, query);
    const items = await getRepository().listNotifications(
      getCurrentUsername(),
      limit
    );

    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json({ items });
  },
});
