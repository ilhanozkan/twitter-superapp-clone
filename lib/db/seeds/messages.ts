import { LaneSeed, SeedContext } from "./types";

// Stub: the messages (and channels) lane defines its seed records and contribution here.

export type MessagesSeed = Record<string, never>;

export const createMessagesSeed: (
  ctx: SeedContext
) => LaneSeed<MessagesSeed> = () => ({ data: null, contribution: {} });
