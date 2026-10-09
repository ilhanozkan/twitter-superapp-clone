import { createHandler } from "../../../../../lib/api/handler";
import { routeKey } from "../../../../../lib/api/validation";
import { visibleRequest } from "../../../../../lib/api/wallet";
import { getCurrentUsername } from "../../../../../lib/auth";
import { PaymentRequestResponse } from "../../../../../types/Api";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

export default createHandler(
  {
    // Only the requester and the payer can read a request; others get 404.
    async GET(req, res) {
      const id = routeKey(req, "id", "Request not found");
      const body: PaymentRequestResponse = {
        request: await visibleRequest(id, getCurrentUsername()),
      };

      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json(body);
    },
  },
  { feature: "wallet" }
);
