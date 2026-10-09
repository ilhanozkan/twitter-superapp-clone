import { RidesRepository } from "../rides/types";
import { unbuiltRides } from "../stubs";
import { SanityDeps } from "./deps";

// Stub: the rides lane replaces this file. Rides documents are private, so the
// feature needs a token to read them.

export function createSanityRides(deps: SanityDeps): RidesRepository {
  return unbuiltRides(deps.canReadPrivate);
}
