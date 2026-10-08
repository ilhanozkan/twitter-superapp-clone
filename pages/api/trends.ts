import { createHandler } from "../../lib/api/handler";
import { limitQuery, parseQuery } from "../../lib/api/validation";
import { DEFAULT_TRENDS_LIMIT } from "../../lib/constants";
import { getRepository } from "../../lib/db";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

const query = limitQuery(20);

export default createHandler({
  async GET(req, res) {
    const { limit = DEFAULT_TRENDS_LIMIT } = parseQuery(req, query);
    const items = await getRepository().listTrends(limit);

    // The same for everyone, so shared caches may keep it briefly.
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=60, stale-while-revalidate=300"
    );
    res.status(200).json({ items });
  },
});
