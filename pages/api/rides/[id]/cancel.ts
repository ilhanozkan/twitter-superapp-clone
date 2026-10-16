import { forbidden } from "../../../../lib/api/errors";
import { createHandler } from "../../../../lib/api/handler";
import { visibleRide } from "../../../../lib/api/rides";
import { routeKey } from "../../../../lib/api/validation";
import { getCurrentUsername } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/db";
import { canCancelRide } from "../../../../lib/superapp/policy/rides";
import { RideMoneyResponse } from "../../../../types/Ride";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

export default createHandler(
  {
    // POST /api/rides/:id/cancel — the rider cancels before pickup and gets
    // the fare back. Idempotent by target state, so it takes no key:
    // repeating it answers 200 with the ride as it is. After pickup: 409.
    async POST(req, res) {
      const id = routeKey(req, "id", "Ride not found");
      const viewer = getCurrentUsername();
      if (!canCancelRide(viewer, await visibleRide(id, viewer))) {
        throw forbidden("Only the rider can cancel this ride");
      }

      const repo = getRepository();
      const { ride } = await repo.rides.cancelRide({ id });
      const body: RideMoneyResponse = {
        ride,
        wallet: await repo.wallet.getWallet(viewer),
        serverNow: new Date().toISOString(),
      };
      res.status(200).json(body);
    },
  },
  { feature: "rides" }
);
