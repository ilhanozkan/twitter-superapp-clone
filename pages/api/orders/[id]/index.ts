import { createHandler } from "../../../../lib/api/handler";
import {
  orderParam,
  serverNow,
  visibleOrder,
} from "../../../../lib/api/orders";
import { getCurrentUsername } from "../../../../lib/auth";
import { OrderResponse } from "../../../../types/Order";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

export default createHandler(
  {
    // GET /api/orders/:id — for its buyer and the people who run its
    // business; 404 for everyone else. Stages are derived at serverNow.
    async GET(req, res) {
      const { order } = await visibleOrder(
        orderParam(req),
        getCurrentUsername()
      );

      const body: OrderResponse = { order, serverNow: serverNow() };
      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json(body);
    },
  },
  { feature: "orders" }
);
