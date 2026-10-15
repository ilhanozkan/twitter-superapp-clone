import { LaneSeed, SeedContext } from "./types";

// Stub: the rides lane defines its seed records and contribution here.

export type RidesSeed = Record<string, never>;

export const createRidesSeed: (
  ctx: SeedContext
) => LaneSeed<RidesSeed> = () => ({ data: null, contribution: {} });
