import { ShopRepository } from "../shop/types";
import { ShopSeed } from "../seeds/shop";
import { unbuiltShop } from "../stubs";
import { MemoryDeps } from "./deps";

// Stub: the shop lane replaces this file.

export type ShopMemoryState = Record<string, never>;

export const createShopMemoryState: (
  seed: ShopSeed | null
) => ShopMemoryState = () => ({});

export const createMemoryShop: (deps: MemoryDeps) => ShopRepository = () =>
  unbuiltShop(true);
