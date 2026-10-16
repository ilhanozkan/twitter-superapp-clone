import { notFound } from "../../../../lib/api/errors";
import { createHandler } from "../../../../lib/api/handler";
import { productParam } from "../../../../lib/api/shop";
import { getRepository } from "../../../../lib/db";
import { ProductDetailResponse } from "../../../../types/Shop";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

export default createHandler(
  {
    // GET /api/products/:id — the product and its card (with the business's
    // status now), for the product dialog and attachment previews.
    async GET(req, res) {
      const id = productParam(req);
      const { shop } = getRepository();
      const [product, cards] = await Promise.all([
        shop.getProduct(id),
        shop.getProductCards([id]),
      ]);
      const card = cards.get(id);
      if (!product || !card) throw notFound("Product not found");

      const body: ProductDetailResponse = { product, card };
      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json(body);
    },
  },
  { feature: "shop" }
);
