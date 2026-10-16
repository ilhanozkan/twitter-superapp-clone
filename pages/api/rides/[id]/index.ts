import { createHandler } from "../../../../lib/api/handler";
import { visibleRide } from "../../../../lib/api/rides";
import { routeKey } from "../../../../lib/api/validation";
import { getCurrentUsername } from "../../../../lib/auth";
import { RideResponse } from "../../../../types/Ride";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

export default createHandler(
  {
    // Only the rider and the driver can read a ride; others get 404. Its
    // status is derived from the clock, so the response carries it.
    async GET(req, res) {
      const id = routeKey(req, "id", "Ride not found");
      const body: RideResponse = {
        ride: await visibleRide(id, getCurrentUsername()),
        serverNow: new Date().toISOString(),
      };

      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json(body);
    },
  },
  { feature: "rides" }
);
