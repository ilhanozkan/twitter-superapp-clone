import { assertActorLimit } from "../../../lib/api/actorLimits";
import { createHandler } from "../../../lib/api/handler";
import {
  parseIdempotency,
  sendMoneyResult,
} from "../../../lib/api/idempotency";
import { bookBody, rideLocation, ridesQuery } from "../../../lib/api/rides";
import { parseBody, parseQuery } from "../../../lib/api/validation";
import { getCurrentUser, getCurrentUsername } from "../../../lib/auth";
import { getRepository } from "../../../lib/db";
import { RideMoneyResponse, RidePageResponse } from "../../../types/Ride";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default createHandler(
  {
    // GET /api/rides?as=rider|driver&limit=&cursor= — the current user's
    // trips (or, for a driver, the trips they drove), newest first.
    async GET(req, res) {
      const { as, limit, cursor } = parseQuery(req, ridesQuery);
      const viewer = getCurrentUsername();
      const page = await getRepository().rides.listRides({
        ...(as === "driver" ? { driver: viewer } : { rider: viewer }),
        limit,
        cursor,
      });

      const body: RidePageResponse = {
        ...page,
        serverNow: new Date().toISOString(),
      };
      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json(body);
    },

    // POST /api/rides { from, to, type, expectedFare } with an
    // Idempotency-Key. The fare is paid upfront and held for the driver
    // until pickup.
    async POST(req, res) {
      const body = parseBody(req, bookBody);
      const key = parseIdempotency(req, {
        scope: "rides.book",
        prefix: "ride",
        payload: body,
      });
      const rider = await getCurrentUser();
      assertActorLimit("money", rider.username);

      const { ride, wallet, replayed } = await getRepository().rides.bookRide({
        ...key,
        ...body,
        rider,
      });

      res.setHeader("Location", rideLocation(ride));
      sendMoneyResult<RideMoneyResponse>(
        res,
        201,
        { ride, wallet, serverNow: new Date().toISOString() },
        replayed
      );
    },
  },
  { feature: "rides" }
);
