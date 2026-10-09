import { createHandler } from "../../../lib/api/handler";
import { parseQuery } from "../../../lib/api/validation";
import { activityQuery } from "../../../lib/api/wallet";
import { getCurrentUsername } from "../../../lib/auth";
import { getRepository } from "../../../lib/db";
import { TransferPageResponse } from "../../../types/Api";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

export default createHandler(
  {
    // GET /api/wallet/activity?limit=&cursor= — transfers from or to the
    // current user, newest first.
    async GET(req, res) {
      const query = parseQuery(req, activityQuery);
      const page: TransferPageResponse =
        await getRepository().wallet.listActivity(getCurrentUsername(), query);

      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json(page);
    },
  },
  { feature: "wallet" }
);
