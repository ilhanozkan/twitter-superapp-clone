import { compareBusinesses, toBusiness } from "../../superapp/business";
import {
  businessSummaries,
  CatalogEntry,
  catalogEntries,
  entriesFor,
  managedProducts,
  productsOf,
  toMenu,
  toProductCard,
} from "../../superapp/shop";
import { IBusiness } from "../../../types/Business";
import { IProduct } from "../../../types/Shop";
import { NotFoundError } from "../errors";
import type { MemoryState } from "../memory";
import { ShopSeed } from "../seeds/shop";
import { ShopRepository } from "../shop/types";
import { MemoryDeps } from "./deps";

export interface ShopMemoryState {
  /** Keyed by id, as Studio stores them. */
  products: Map<string, IProduct>;
}

export function createShopMemoryState(seed: ShopSeed | null): ShopMemoryState {
  return {
    products: new Map(
      (seed?.products ?? []).map((product) => [product.id, { ...product }])
    ),
  };
}

const key = (username: string) => username.toLowerCase();

/**
 * Every business as F's business repository reads it, but synchronously:
 * orders price and validate products inside the ledger's critical section,
 * where async reads aren't allowed.
 */
export function memoryBusinesses(state: MemoryState, now: Date): IBusiness[] {
  return [...state.business.profiles.values()]
    .flatMap((profile) => {
      const user = state.users.get(key(profile.username));
      if (!user || user.accountType !== "business") return [];
      return [
        toBusiness(
          profile,
          {
            username: user.username,
            fullname: user.fullname,
            image: user.image,
          },
          state.wallet.frozen.has(key(profile.username)),
          now
        ),
      ];
    })
    .sort(compareBusinesses);
}

/** The businesses and every product the app can show right now (synchronous; see above). */
export function memoryCatalog(
  state: MemoryState,
  now: Date
): { businesses: IBusiness[]; entries: CatalogEntry[] } {
  const businesses = memoryBusinesses(state, now);
  return {
    businesses,
    entries: catalogEntries([...state.shop.products.values()], businesses),
  };
}

/** Products and menus in memory; the business side is F's business state. */
export function createMemoryShop(deps: MemoryDeps): ShopRepository {
  const { state, now } = deps;
  const catalog = () => memoryCatalog(state, now());

  return {
    implemented: true,
    configured: true,
    notifications: async () => [],
    liveActivity: async () => [],

    async getProductCards(ids) {
      return new Map(
        entriesFor(ids, catalog().entries).map((entry) => [
          entry.product.id,
          toProductCard(entry),
        ])
      );
    },

    async getProduct(id) {
      return entriesFor([id], catalog().entries)[0]?.product ?? null;
    },

    async getProducts(ids) {
      return entriesFor(ids, catalog().entries).map((entry) => entry.product);
    },

    async listBusinessSummaries(query = {}) {
      const { businesses, entries } = catalog();
      return businessSummaries(businesses, entries, query.category);
    },

    async getMenu(username) {
      return toMenu(productsOf(catalog().entries, username));
    },

    async listAttachableProducts(username) {
      const { businesses, entries } = catalog();
      return managedProducts(username, businesses, entries);
    },

    async setProductAvailability(id, available) {
      const [entry] = entriesFor([id], catalog().entries);
      if (!entry) throw new NotFoundError("Product not found");
      state.shop.products.get(id)!.available = available;
      return { ...entry.product, available };
    },
  };
}
