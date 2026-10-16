import { assertActorLimit } from "../../../lib/api/actorLimits";
import { createHandler } from "../../../lib/api/handler";
import {
  parseIdempotency,
  sendMoneyResult,
} from "../../../lib/api/idempotency";
import {
  orderLocation,
  ordersQuery,
  placeOrderBody,
  serverNow,
} from "../../../lib/api/orders";
import { findBusiness, managedBusiness } from "../../../lib/api/shop";
import { parseBody, parseQuery } from "../../../lib/api/validation";
import { assertNotSelf } from "../../../lib/api/wallet";
import { getCurrentUser, getCurrentUsername } from "../../../lib/auth";
import { getRepository } from "../../../lib/db";
import { OrderMoneyResponse, OrderPageResponse } from "../../../types/Order";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default createHandler(
  {
    // GET /api/orders?as=buyer|business&business=&state=active|past&cursor=&limit=
    // Your own orders (as=buyer, the default; `business` narrows them), or
    // a business's you run (as=business&business=, 404 for anyone else).
    async GET(req, res) {
      const { as, business, ...page } = parseQuery(req, ordersQuery);
      const viewer = getCurrentUsername();
      const filter =
        as === "business"
          ? { business: (await managedBusiness(business!, viewer)).username }
          : { buyer: viewer, business };

      const body: OrderPageResponse = {
        ...(await getRepository().orders.listOrders({ ...filter, ...page })),
        serverNow: serverNow(),
      };
      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json(body);
    },

    // POST /api/orders { business, items, deliveryPlaceId, note?, expectedTotal,
    // sourceTweetId? } with an Idempotency-Key
    async POST(req, res) {
      const body = parseBody(req, placeOrderBody);
      assertNotSelf(
        body.business,
        "business",
        "You can't order from your own business"
      );
      const key = parseIdempotency(req, {
        scope: "orders.place",
        prefix: "order",
        payload: { ...body, business: body.business.toLowerCase() },
      });
      const repo = getRepository();
      const buyer = await getCurrentUser();
      await findBusiness(body.business);
      // A Tweet deleted since the card was shown just isn't credited.
      const sourceTweetId =
        body.sourceTweetId && (await repo.getTweet(body.sourceTweetId))
          ? body.sourceTweetId
          : null;
      assertActorLimit("money", buyer.username);

      const { order, wallet, replayed } = await repo.orders.placeOrder({
        ...key,
        buyer,
        business: body.business,
        lines: body.items,
        deliveryPlaceId: body.deliveryPlaceId,
        note: body.note,
        expectedTotal: body.expectedTotal,
        sourceTweetId,
      });

      res.setHeader("Location", orderLocation(order));
      sendMoneyResult<OrderMoneyResponse>(
        res,
        201,
        { order, wallet, serverNow: serverNow() },
        replayed
      );
    },
  },
  { feature: "orders" }
);
