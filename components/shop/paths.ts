// Where the shop's pages live, so links can't drift from the routes.

export const FOOD_PATH = "/food";

/** A business's Menu tab; with a product, its details dialog open (`?product=`). */
export function menuPath(username: string, productId?: string): string {
  const path = `/${username}/menu`;
  return productId ? `${path}?product=${encodeURIComponent(productId)}` : path;
}

export type BusinessTab = "orders" | "menu" | "settings";

/** The tab /business opens on: Orders (the Business board) while orders are on. */
export const DEFAULT_BUSINESS_TAB: BusinessTab = "orders";

/**
 * The Business page of one of the viewer's businesses. The first one they
 * manage and the Orders tab are the defaults, so they stay out of the URL
 * (with orders off, /business opens on Menu, and `?tab=menu` says so too).
 */
export function businessPath({
  business,
  tab = DEFAULT_BUSINESS_TAB,
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
  if (tab !== DEFAULT_BUSINESS_TAB) query.set("tab", tab);
  const search = query.toString();
  return search ? `/business?${search}` : "/business";
}

/**
 * The tab a /business URL asks for. Orders needs the orders feature: while
 * it is off the page opens on Menu, as before orders shipped.
 */
export function businessTab(query: unknown, ordersOn: boolean): BusinessTab {
  if (query === "menu" || query === "settings") return query;
  return ordersOn ? "orders" : "menu";
}
