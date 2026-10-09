import { LaneSeed, SeedContext } from "./types";

// Stub: the shop lane defines its seed records and contribution here.

export type ShopSeed = Record<string, never>;

export const createShopSeed: (ctx: SeedContext) => LaneSeed<ShopSeed> = () => ({
  data: null,
  contribution: {},
});
