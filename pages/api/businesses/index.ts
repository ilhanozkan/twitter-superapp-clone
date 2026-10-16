import { createHandler } from "../../../lib/api/handler";
import { businessesQuery } from "../../../lib/api/shop";
import { parseQuery } from "../../../lib/api/validation";
import { getRepository } from "../../../lib/db";
import { BusinessSummariesResponse } from "../../../types/Shop";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

export default createHandler(
  {
    // GET /api/businesses?category= — every business by name, with its
    // status and top items (the Food hub). The same for everyone, so shared
    // caches may keep it briefly; the client renders the status it carries.
    async GET(req, res) {
      const { category } = parseQuery(req, businessesQuery);
      const body: BusinessSummariesResponse = {
        items: await getRepository().shop.listBusinessSummaries({ category }),
      };

      res.setHeader("Cache-Control", "public, s-maxage=30");
      res.status(200).json(body);
    },
  },
  { feature: "shop" }
);
