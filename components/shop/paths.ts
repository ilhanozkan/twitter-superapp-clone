// Where the shop's pages live, so links can't drift from the routes.

export const FOOD_PATH = "/food";

/** A business's Menu tab; with a product, its details dialog open (`?product=`). */
export function menuPath(username: string, productId?: string): string {
  const path = `/${username}/menu`;
  return productId ? `${path}?product=${encodeURIComponent(productId)}` : path;
}

export type BusinessTab = "menu" | "settings";

/**
 * The Business page of one of the viewer's businesses. The first one they
 * manage and the Menu tab are the defaults, so they stay out of the URL.
 */
export function businessPath({
  business,
  tab = "menu",
  defaultBusiness,
}: {
  business: string;
  tab?: BusinessTab;
  defaultBusiness?: string;
}): string {
  const query = new URLSearchParams();
  if (business.toLowerCase() !== defaultBusiness?.toLowerCase()) {
    query.set("business", business);
  }
  if (tab !== "menu") query.set("tab", tab);
  const search = query.toString();
  return search ? `/business?${search}` : "/business";
}
