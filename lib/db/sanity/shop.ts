import { ShopRepository } from "../shop/types";
import { unbuiltShop } from "../stubs";
import { SanityDeps } from "./deps";

// Stub: the shop lane replaces this file. Its documents are public, so it
// stays readable without a token.

export const createSanityShop: (deps: SanityDeps) => ShopRepository = () =>
  unbuiltShop(true);
