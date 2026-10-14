import { forbidden } from "../../../../lib/api/errors";
import { createHandler } from "../../../../lib/api/handler";
import {
  cancelBody,
  orderParam,
  serverNow,
  visibleOrder,
} from "../../../../lib/api/orders";
import { parseBody } from "../../../../lib/api/validation";
import { getCurrentUsername } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/db";
import { canCancelOrder } from "../../../../lib/superapp/policy/orders";
import { OrderMoneyResponse } from "../../../../types/Order";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default createHandler(
  {
    // POST /api/orders/:id/cancel { as: "buyer" | "business" } — a full
    // refund of the held payment. Idempotent by state, so it takes no key:
    // repeating it answers 200 with the order as it is. The buyer cancels
    // until the business accepts, the business until delivery (409 after).
    async POST(req, res) {
      const id = orderParam(req);
      const { as } = parseBody(req, cancelBody);
      const viewer = getCurrentUsername();
      const { order, business } = await visibleOrder(id, viewer);
      if (!canCancelOrder(viewer, order, business, as)) {
        throw forbidden(
          as === "buyer"
            ? "Only the buyer can cancel as the buyer"
            : `Only the people who run ${order.business.fullname} can cancel for it`
        );
      }

      const repo = getRepository();
      const { order: cancelled } = await repo.orders.cancelOrder({ id, as });
      const body: OrderMoneyResponse = {
        order: cancelled,
        wallet: await repo.wallet.getWallet(viewer),
        serverNow: serverNow(),
      };
      res.status(200).json(body);
    },
  },
  { feature: "orders" }
);
