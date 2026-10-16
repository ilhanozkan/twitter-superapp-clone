import { createHandler } from "../../../../lib/api/handler";
import {
  availabilityBody,
  managedProduct,
  productParam,
} from "../../../../lib/api/shop";
import { parseBody } from "../../../../lib/api/validation";
import { getCurrentUsername } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/db";
import { ProductResponse } from "../../../../types/Shop";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default createHandler(
  {
    // PUT /api/products/:id/availability { available } — marks a product
    // sold out (false) or back (true), for its business's managers only
    // (404 for everyone else).
    async PUT(req, res) {
      const id = productParam(req);
      const body = parseBody(req, availabilityBody);
      const product = await managedProduct(id, getCurrentUsername());

      const result: ProductResponse = {
        product: await getRepository().shop.setProductAvailability(
          product.id,
          body.available
        ),
      };
      res.status(200).json(result);
    },
  },
  { feature: "shop" }
);
