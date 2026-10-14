import { assertActorLimit } from "../../../../lib/api/actorLimits";
import { createHandler } from "../../../../lib/api/handler";
import {
  parseIdempotency,
  sendMoneyResult,
} from "../../../../lib/api/idempotency";
import { orderLocation, serverNow } from "../../../../lib/api/orders";
import { businessParam, managedBusiness } from "../../../../lib/api/shop";
import { getCurrentUser } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/db";
import { OrderResponse } from "../../../../types/Order";

// No request body (the demo bot picks the items): skip parsing.
export const config = { api: { bodyParser: false } };

export default createHandler(
  {
    // POST /api/businesses/:username/demo-orders with an Idempotency-Key —
    // "Simulate a customer order · Demo bot", for the business's managers
    // (404 for everyone else), 5 an hour per user.
    async POST(req, res) {
      const username = businessParam(req);
      const key = parseIdempotency(req, {
        scope: "orders.demo",
        prefix: "order",
        payload: { business: username.toLowerCase() },
      });
      const requestedBy = await getCurrentUser();
      const business = await managedBusiness(username, requestedBy.username);
      assertActorLimit("demoOrders", requestedBy.username);

      const { order, replayed } = await getRepository().orders.placeDemoOrder({
        ...key,
        business: business.username,
        requestedBy,
      });

      res.setHeader("Location", orderLocation(order));
      sendMoneyResult<OrderResponse>(
        res,
        201,
        { order, serverNow: serverNow() },
        replayed
      );
    },
  },
  { feature: "orders" }
);
