import { assertActorLimit } from "../../../../lib/api/actorLimits";
import { forbidden } from "../../../../lib/api/errors";
import { createHandler } from "../../../../lib/api/handler";
import {
  parseIdempotency,
  sendMoneyResult,
} from "../../../../lib/api/idempotency";
import { rideTipBody, visibleRide } from "../../../../lib/api/rides";
import { parseBody, routeKey } from "../../../../lib/api/validation";
import { transferLocation } from "../../../../lib/api/wallet";
import { getCurrentUser } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/db";
import { canTipRide } from "../../../../lib/superapp/policy/rides";
import { planRideTip } from "../../../../lib/superapp/rides";
import { MoneyResponse } from "../../../../types/Api";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default createHandler(
  {
    // POST /api/rides/:id/tip { amount } with an Idempotency-Key. The rider
    // tips the driver through the wallet once the ride is complete (409
    // before that).
    async POST(req, res) {
      const id = routeKey(req, "id", "Ride not found");
      const body = parseBody(req, rideTipBody);
      const key = parseIdempotency(req, {
        scope: "rides.tip",
        prefix: "tx",
        payload: { ...body, rideId: id },
      });
      const from = await getCurrentUser();
      const ride = await visibleRide(id, from.username);
      if (!canTipRide(from.username, ride)) {
        throw forbidden("Only the rider can tip the driver");
      }
      const tip = planRideTip(ride, from, body.amount, key);
      assertActorLimit("money", from.username);

      const { transfer, wallet, replayed } =
        await getRepository().wallet.send(tip);

      res.setHeader("Location", transferLocation(transfer));
      sendMoneyResult<MoneyResponse>(res, 201, { transfer, wallet }, replayed);
    },
  },
  { feature: "rides" }
);
