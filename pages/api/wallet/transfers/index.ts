import { assertActorLimit } from "../../../../lib/api/actorLimits";
import { createHandler } from "../../../../lib/api/handler";
import {
  parseIdempotency,
  sendMoneyResult,
} from "../../../../lib/api/idempotency";
import { parseBody } from "../../../../lib/api/validation";
import {
  assertNotSelf,
  findParty,
  sendBody,
  transferLocation,
} from "../../../../lib/api/wallet";
import { getCurrentUser } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/db";
import { MoneyResponse } from "../../../../types/Api";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default createHandler(
  {
    // POST /api/wallet/transfers { to, amount, note? } with an Idempotency-Key
    async POST(req, res) {
      const body = parseBody(req, sendBody);
      assertNotSelf(body.to, "to", "You can't send credits to yourself");
      const key = parseIdempotency(req, {
        scope: "wallet.send",
        prefix: "tx",
        payload: { ...body, to: body.to.toLowerCase() },
      });
      const from = await getCurrentUser();
      const to = await findParty(body.to);
      assertActorLimit("money", from.username);

      const { transfer, wallet, replayed } = await getRepository().wallet.send({
        ...key,
        kind: "payment",
        from,
        to,
        amount: body.amount,
        note: body.note,
        context: null,
      });

      res.setHeader("Location", transferLocation(transfer));
      sendMoneyResult<MoneyResponse>(res, 201, { transfer, wallet }, replayed);
    },
  },
  { feature: "wallet" }
);
