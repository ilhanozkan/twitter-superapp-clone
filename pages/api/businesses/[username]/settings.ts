import { createHandler } from "../../../../lib/api/handler";
import {
  businessParam,
  managedBusiness,
  settingsBody,
} from "../../../../lib/api/shop";
import { parseBody } from "../../../../lib/api/validation";
import { getCurrentUsername } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/db";
import { BusinessResponse } from "../../../../types/Shop";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default createHandler(
  {
    // PUT /api/businesses/:username/settings { acceptingOrders } — the
    // "Accepting orders" switch, for the business's managers (404 for
    // everyone else). Everything else about a business is edited in Studio.
    async PUT(req, res) {
      const username = businessParam(req);
      const body = parseBody(req, settingsBody);
      const business = await managedBusiness(username, getCurrentUsername());

      const result: BusinessResponse = {
        business: await getRepository().business.setAcceptingOrders(
          business.username,
          body.acceptingOrders
        ),
      };
      res.status(200).json(result);
    },
  },
  { feature: "shop" }
);
