import type { Repository } from "../db";
import { UnavailableError } from "../db/errors";
import { TweetAttachmentInput } from "../../types/Tweet";
import { invalid, notFound } from "./errors";

/**
 * Checks a product attachment on a new Tweet. Any account may attach any
 * product, like sharing a link; it must exist and be available now. While
 * the shop is off nothing can be attached (400 at `attachment`).
 */
export async function checkAttachment(
  repo: Pick<Repository, "features" | "shop">,
  attachment: TweetAttachmentInput
): Promise<TweetAttachmentInput> {
  if (!repo.features.shop) {
    throw invalid("attachment", "Products can't be attached on this site");
  }
  const product = await repo.shop.getProduct(attachment.productId);
  if (!product) throw notFound("Product not found");
  if (!product.available) {
    throw new UnavailableError(`${product.name} is sold out`, [product.id]);
  }
  return { type: "product", productId: product.id };
}
