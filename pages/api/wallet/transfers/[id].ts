import { createHandler } from "../../../../lib/api/handler";
import { routeKey } from "../../../../lib/api/validation";
import { visibleTransfer } from "../../../../lib/api/wallet";
import { getCurrentUsername } from "../../../../lib/auth";
import { TransferResponse } from "../../../../types/Api";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

export default createHandler(
  {
    // A receipt: only its two parties can read it, everyone else gets 404.
    async GET(req, res) {
      const id = routeKey(req, "id", "Transfer not found");
      const body: TransferResponse = {
        transfer: await visibleTransfer(id, getCurrentUsername()),
      };

      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json(body);
    },
  },
  { feature: "wallet" }
);
