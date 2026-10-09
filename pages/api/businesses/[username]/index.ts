import { createHandler } from "../../../../lib/api/handler";
import { businessParam, findBusiness } from "../../../../lib/api/shop";
import { getRepository } from "../../../../lib/db";
import { BusinessMenuResponse } from "../../../../types/Shop";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

export default createHandler(
  {
    // GET /api/businesses/:username — the business with its menu. Personal
    // accounts and unknown usernames are 404.
    async GET(req, res) {
      const business = await findBusiness(businessParam(req));
      const body: BusinessMenuResponse = {
        business,
        menu: await getRepository().shop.getMenu(business.username),
      };

      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json(body);
    },
  },
  { feature: "shop" }
);
