import { createHandler } from "../../../../lib/api/handler";
import { serverNow, summaryQuery } from "../../../../lib/api/orders";
import { businessParam, managedBusiness } from "../../../../lib/api/shop";
import { parseQuery } from "../../../../lib/api/validation";
import { getCurrentUsername } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/db";
import { startOfLocalDay } from "../../../../lib/superapp/orders";
import { BusinessSummaryResponse } from "../../../../types/Order";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

export default createHandler(
  {
    // GET /api/businesses/:username/summary?since=ISO — the Business board's
    // "Today: 4 orders · 63.00 credits · 15.00 pending" and the business's
    // wallet, for its managers (404 for everyone else). `since` defaults to
    // local midnight in the business's time zone.
    async GET(req, res) {
      const username = businessParam(req);
      const query = parseQuery(req, summaryQuery);
      const business = await managedBusiness(username, getCurrentUsername());
      const since = query.since
        ? new Date(query.since).toISOString()
        : startOfLocalDay(new Date(), business.hours.timeZone);

      const repo = getRepository();
      const [summary, wallet] = await Promise.all([
        repo.orders.businessSummary(business.username, since),
        repo.wallet.getWallet(business.username),
      ]);
      const body: BusinessSummaryResponse = {
        summary,
        wallet,
        since,
        serverNow: serverNow(),
      };
      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json(body);
    },
  },
  { feature: "orders" }
);
