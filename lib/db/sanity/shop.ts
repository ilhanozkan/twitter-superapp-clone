import { isSafeImageUrl } from "../../imageUrl";
import { managedBusinesses } from "../../superapp/business";
import {
  businessSummaries,
  CatalogEntry,
  catalogEntries,
  entriesFor,
  managedProducts,
  productsOf,
  toMenu,
  toProductCard,
  withPurchasedProducts,
} from "../../superapp/shop";
import { IBusiness } from "../../../types/Business";
import { IProduct } from "../../../types/Shop";
import { NotFoundError } from "../errors";
import { ShopRepository } from "../shop/types";
import { SanityDeps } from "./deps";
import { readPurchasedProductIds } from "./orders";
import {
  ALL_PRODUCTS_QUERY,
  ATTACHABLE_QUERY,
  PRODUCTS_BY_ID_QUERY,
  PRODUCTS_OF_QUERY,
} from "./shopQueries";

/** A product document as the queries project it; Studio may leave any field empty. */
interface ProductRow {
  id: string;
  business: unknown;
  section: unknown;
  name: unknown;
  description: unknown;
  price: unknown;
  image: unknown;
  imageAlt: unknown;
  available: boolean;
  position: unknown;
}

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const optionalText = (value: unknown) => text(value) || null;
const numeric = (value: unknown) => (typeof value === "number" ? value : 0);

/**
 * Studio data as the app's product: blanks become null, unsafe image URLs
 * are dropped. `business` is kept as typed: menus and the picker match it
 * in GROQ, which can't trim, so a padded username must name no business in
 * any read (memory's rule too) rather than in some.
 */
function toProduct(row: ProductRow): IProduct {
  const image = optionalText(row.image);
  return {
    id: row.id,
    business: typeof row.business === "string" ? row.business : "",
    section: text(row.section),
    name: text(row.name),
    description: optionalText(row.description),
    price: numeric(row.price),
    image: image && isSafeImageUrl(image) ? image : null,
    imageAlt: optionalText(row.imageAlt),
    available: row.available,
    position: numeric(row.position),
  };
}

const lower = (username: string) => username.toLowerCase();

/**
 * Products on Sanity: public, live-edited documents, readable without a
 * token. Reads join them with the businesses as F's business repository
 * reads them (status, freeze), so a Tweet page's cards take one products
 * query and one businesses query, in parallel. Writes need a token.
 */
export function createSanityShop(deps: SanityDeps): ShopRepository {
  const businesses = () => deps.self().business.listBusinesses();

  const join = (rows: ProductRow[] | null, all: IBusiness[]) =>
    catalogEntries((rows ?? []).map(toProduct), all);

  const load = async (
    query: string,
    params: Record<string, unknown> = {}
  ): Promise<{ businesses: IBusiness[]; entries: CatalogEntry[] }> => {
    const [rows, all] = await Promise.all([
      deps.read<ProductRow[] | null>(query, params),
      businesses(),
    ]);
    return { businesses: all, entries: join(rows, all) };
  };

  const byIds = async (ids: string[]) => {
    if (ids.length === 0) return [];
    const { entries } = await load(PRODUCTS_BY_ID_QUERY, {
      ids: [...new Set(ids)],
    });
    return entriesFor(ids, entries);
  };

  return {
    implemented: true,
    configured: true,
    notifications: async () => [],
    liveActivity: async () => [],

    async getProductCards(ids) {
      return new Map(
        (await byIds(ids)).map((entry) => [
          entry.product.id,
          toProductCard(entry),
        ])
      );
    },

    async getProduct(id) {
      return (await byIds([id]))[0]?.product ?? null;
    },

    async getProducts(ids) {
      return (await byIds(ids)).map((entry) => entry.product);
    },

    async listBusinessSummaries(query = {}) {
      const { businesses: all, entries } = await load(ALL_PRODUCTS_QUERY);
      return businessSummaries(all, entries, query.category);
    },

    async getMenu(username) {
      const { entries } = await load(PRODUCTS_OF_QUERY, {
        businesses: [lower(username)],
      });
      return toMenu(productsOf(entries, username));
    },

    async listAttachableProducts(username) {
      // What you ordered before is only suggested while ordering is on.
      const [all, purchased] = await Promise.all([
        businesses(),
        deps.self().features.orders
          ? readPurchasedProductIds(deps, username)
          : [],
      ]);
      const managed = managedBusinesses(all, username);
      if (managed.length === 0 && purchased.length === 0) return [];
      const rows = await deps.read<ProductRow[] | null>(ATTACHABLE_QUERY, {
        businesses: managed.map(lower),
        ids: purchased,
      });
      const entries = join(rows, all);
      return withPurchasedProducts(
        managedProducts(username, all, entries),
        purchased,
        entries
      );
    },

    async setProductAvailability(id, available) {
      deps.assertWritable();
      const [entry] = await byIds([id]);
      if (!entry) throw new NotFoundError("Product not found");
      await deps.client.mutate(
        [{ patch: { id: entry.product.id, set: { available } } }],
        { visibility: "sync" }
      );
      return { ...entry.product, available };
    },
  };
}
