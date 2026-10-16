import { createHandler } from "../../../lib/api/handler";
import { getCurrentUsername } from "../../../lib/auth";
import { getRepository } from "../../../lib/db";
import { ProductsResponse } from "../../../types/Shop";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

export default createHandler(
  {
    // GET /api/products/attachable — what the composer's picker suggests:
    // available products of the businesses the current user runs. Any
    // product can still be attached by id, like sharing a link.
    async GET(req, res) {
      const body: ProductsResponse = {
        items:
          await getRepository().shop.listAttachableProducts(
            getCurrentUsername()
          ),
      };

      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json(body);
    },
  },
  { feature: "shop" }
);
