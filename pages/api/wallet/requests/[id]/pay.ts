import { assertActorLimit } from "../../../../../lib/api/actorLimits";
import { createHandler } from "../../../../../lib/api/handler";
import {
  parseIdempotency,
  sendMoneyResult,
} from "../../../../../lib/api/idempotency";
import { routeKey } from "../../../../../lib/api/validation";
import { assertCanPay, visibleRequest } from "../../../../../lib/api/wallet";
import { getCurrentUser } from "../../../../../lib/auth";
import { getRepository } from "../../../../../lib/db";
import { PayRequestResponse } from "../../../../../types/Api";

// No request body (the request says what to pay): skip parsing.
export const config = { api: { bodyParser: false } };

export default createHandler(
  {
    // POST /api/wallet/requests/:id/pay with an Idempotency-Key
    async POST(req, res) {
      const id = routeKey(req, "id", "Request not found");
      const key = parseIdempotency(req, {
        scope: "wallet.payRequest",
        prefix: "tx",
        payload: { id },
      });
      const payer = await getCurrentUser();
      assertCanPay(payer.username, await visibleRequest(id, payer.username));
      assertActorLimit("money", payer.username);

      const { request, transfer, wallet, replayed } =
        await getRepository().wallet.payRequest({ ...key, id, payer });

      sendMoneyResult<PayRequestResponse>(
        res,
        200,
        { request, transfer, wallet },
        replayed
      );
    },
  },
  { feature: "wallet" }
);
