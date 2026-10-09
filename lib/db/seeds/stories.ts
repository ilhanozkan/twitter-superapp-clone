import { LaneSeed, SeedContext } from "./types";

// Stub: the stories lane defines its seed records and contribution here.

export type StoriesSeed = Record<string, never>;

export const createStoriesSeed: (
  ctx: SeedContext
) => LaneSeed<StoriesSeed> = () => ({ data: null, contribution: {} });
