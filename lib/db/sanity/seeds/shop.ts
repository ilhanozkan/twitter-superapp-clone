import { SeedData } from "../../seed";
import { compact, SanitySeedDocument } from "./documents";

/**
 * Products are public, live-edited documents. Seeded ones keep their seed
 * ids, which Tweets' attachments name; they date from their business's
 * account.
 */
export function shopSanityDocuments(seed: SeedData): SanitySeedDocument[] {
  const joinedAt = new Map(
    seed.users.map((user) => [user.username.toLowerCase(), user.joinedAt])
  );

  return (seed.superapp?.shop?.products ?? []).map((product) => {
    const createdAt = joinedAt.get(product.business.toLowerCase());
    if (!createdAt) {
      throw new Error(
        `Product "${product.id}" of unknown business "${product.business}"`
      );
    }
    return compact({
      _id: product.id,
      _type: "product",
      _createdAt: createdAt,
      business: product.business,
      section: product.section,
      name: product.name,
      description: product.description,
      price: product.price,
      image: product.image,
      imageAlt: product.imageAlt,
      available: product.available,
      position: product.position,
    });
  });
}
