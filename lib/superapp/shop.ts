import { BusinessCategory, IBusiness } from "../../types/Business";
import {
  IBusinessSummary,
  IMenuSection,
  IProduct,
  IProductCard,
} from "../../types/Shop";
import { managedBusinesses } from "./business";

// The shop's rules, shared by both stores so they read menus, cards and
// summaries identically. Products are public documents edited in Studio;
// everything about the business (name, avatar, status) comes from F's
// business records at read time.

/** Studio-only product fields; sanity/env.ts STUDIO_LIMITS.product mirrors them. */
export const PRODUCT_LIMITS = {
  nameMax: 60,
  descriptionMax: 140,
  imageAltMax: 120,
  price: { min: 10, max: 20_000 },
} as const;

/** How many product names a business summary carries (the Food hub's "top 3"). */
export const HIGHLIGHT_COUNT = 3;

/** Every category with its label, in the Food hub's chip order. */
export const CATEGORY_LABELS: Record<BusinessCategory, string> = {
  cafe: "Café",
  restaurant: "Restaurant",
  healthy: "Healthy",
  shop: "Shop",
};

export const BUSINESS_CATEGORIES = Object.keys(
  CATEGORY_LABELS
) as BusinessCategory[];

/** A product the app can show, with the business it belongs to. */
export interface CatalogEntry {
  product: IProduct;
  business: IBusiness;
}

const key = (username: string) => username.toLowerCase();

/** Code-point order, like GROQ's `order()`. */
const compareKeys = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** By position, then by id, so ties sort the same in every store. */
export function compareProducts(
  a: Pick<IProduct, "position" | "id">,
  b: Pick<IProduct, "position" | "id">
): number {
  return a.position - b.position || compareKeys(a.id, b.id);
}

/**
 * Whether a stored product is complete enough to show. Products are
 * live-edited, so Studio publishes a new one field by field while it is
 * being typed; until it has a name, a section and a valid price it stays
 * hidden.
 */
export function isComplete(product: IProduct): boolean {
  const { min, max } = PRODUCT_LIMITS.price;
  return (
    product.name.trim() !== "" &&
    product.section.trim() !== "" &&
    Number.isInteger(product.price) &&
    product.price >= min &&
    product.price <= max &&
    Number.isFinite(product.position)
  );
}

/**
 * The products that exist as far as the app is concerned: complete ones of
 * accounts that are businesses right now, each named by its business's own
 * username (Studio may spell it in another case).
 */
export function catalogEntries(
  products: IProduct[],
  businesses: IBusiness[]
): CatalogEntry[] {
  const byKey = new Map(businesses.map((b) => [key(b.username), b]));
  return products.flatMap((product) => {
    const business = byKey.get(key(product.business));
    if (!business || !isComplete(product)) return [];
    return [{ product: { ...product, business: business.username }, business }];
  });
}

/** Sections in the order of their first product; products by position within each. */
export function toMenu(products: IProduct[]): IMenuSection[] {
  const sections = new Map<string, IProduct[]>();
  for (const product of [...products].sort(compareProducts)) {
    const section = sections.get(product.section);
    if (section) section.push(product);
    else sections.set(product.section, [product]);
  }
  return [...sections].map(([title, items]) => ({ title, products: items }));
}

/** The products as a menu lists them, top to bottom. */
export function menuOrder(products: IProduct[]): IProduct[] {
  return toMenu(products).flatMap((section) => section.products);
}

export function toProductCard({
  product,
  business,
}: CatalogEntry): IProductCard {
  return {
    id: product.id,
    name: product.name,
    price: product.price,
    image: product.image,
    imageAlt: product.imageAlt,
    available: product.available,
    business: {
      username: business.username,
      fullname: business.fullname,
      image: business.image,
      status: business.status,
      etaMinutes: [...business.etaMinutes],
    },
  };
}

/** The Food hub's card: the business as read now, plus the first available products on its menu. */
export function toBusinessSummary(
  business: IBusiness,
  products: IProduct[]
): IBusinessSummary {
  return {
    username: business.username,
    fullname: business.fullname,
    image: business.image,
    banner: business.banner,
    category: business.category,
    placeId: business.placeId,
    deliveryFee: business.deliveryFee,
    status: business.status,
    etaMinutes: [...business.etaMinutes],
    // Top to bottom as the menu shows it, skipping what is sold out.
    highlights: menuOrder(products)
      .filter((product) => product.available)
      .slice(0, HIGHLIGHT_COUNT)
      .map((product) => product.name),
  };
}

/** The products of `username`'s business, in any case. */
export function productsOf(
  entries: CatalogEntry[],
  username: string
): IProduct[] {
  return entries
    .filter((entry) => key(entry.business.username) === key(username))
    .map((entry) => entry.product);
}

/** Every business (in the order given, by name) with its highlights, optionally of one category. */
export function businessSummaries(
  businesses: IBusiness[],
  entries: CatalogEntry[],
  category?: BusinessCategory
): IBusinessSummary[] {
  return businesses
    .filter((business) => !category || business.category === category)
    .map((business) =>
      toBusinessSummary(business, productsOf(entries, business.username))
    );
}

/**
 * The available products of the businesses `username` runs: their own
 * account's first, then delegations, each in menu order.
 */
export function managedProducts(
  username: string,
  businesses: IBusiness[],
  entries: CatalogEntry[]
): IProduct[] {
  return managedBusinesses(businesses, username).flatMap((business) =>
    menuOrder(productsOf(entries, business)).filter(
      (product) => product.available
    )
  );
}

/** The entries for `ids` in that order, each once; unknown ids are skipped. */
export function entriesFor(
  ids: string[],
  entries: CatalogEntry[]
): CatalogEntry[] {
  const byId = new Map(entries.map((entry) => [entry.product.id, entry]));
  return [...new Set(ids)].flatMap((id) => {
    const entry = byId.get(id);
    return entry ? [entry] : [];
  });
}
