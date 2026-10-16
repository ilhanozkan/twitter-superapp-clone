import { createHandler } from "../../../lib/api/handler";
import { quoteQuery } from "../../../lib/api/rides";
import { parseQuery } from "../../../lib/api/validation";
import { getRepository } from "../../../lib/db";
import { RideQuoteResponse } from "../../../types/Ride";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

export default createHandler(
  {
    // GET /api/rides/quote?from=&to= — upfront fares for every ride type,
    // and whether a driver of each is free. The same for every visitor, so
    // a shared cache may keep it for a minute; booking re-checks both.
    async GET(req, res) {
      const { from, to } = parseQuery(req, quoteQuery);
      const body: RideQuoteResponse = await getRepository().rides.quote(
        from,
        to
      );

      res.setHeader("Cache-Control", "public, s-maxage=60");
      res.status(200).json(body);
    },
  },
  { feature: "rides" }
);
