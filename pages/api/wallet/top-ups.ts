import { assertActorLimit } from "../../../lib/api/actorLimits";
import { createHandler } from "../../../lib/api/handler";
import {
  parseIdempotency,
  sendMoneyResult,
} from "../../../lib/api/idempotency";
import { parseBody } from "../../../lib/api/validation";
import { topUpBody, transferLocation } from "../../../lib/api/wallet";
import { getCurrentUser } from "../../../lib/auth";
import { getRepository } from "../../../lib/db";
import { MoneyResponse } from "../../../types/Api";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default createHandler(
  {
    // POST /api/wallet/top-ups { amount } with an Idempotency-Key: free demo
    // credits, a few times a day and up to a balance cap.
    async POST(req, res) {
      const body = parseBody(req, topUpBody);
      const key = parseIdempotency(req, {
        scope: "wallet.topUp",
        prefix: "tx",
        payload: body,
      });
      const to = await getCurrentUser();
      assertActorLimit("money", to.username);

      const { transfer, wallet, replayed } = await getRepository().wallet.topUp(
        {
          ...key,
          to,
          amount: body.amount,
        }
      );

      res.setHeader("Location", transferLocation(transfer));
      sendMoneyResult<MoneyResponse>(res, 201, { transfer, wallet }, replayed);
    },
  },
  { feature: "wallet" }
);
