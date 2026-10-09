import { LaneSeed, SeedContext } from "./types";

// Stub: the orders lane defines its seed records and contribution here.

export type OrdersSeed = Record<string, never>;

export const createOrdersSeed: (
  ctx: SeedContext
) => LaneSeed<OrdersSeed> = () => ({ data: null, contribution: {} });
