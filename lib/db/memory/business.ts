import { BusinessProfile, BusinessRepository } from "../business/types";
import { BusinessSeed } from "../seeds/business";
import { unbuiltBusiness } from "../stubs";
import { MemoryDeps } from "./deps";

export interface BusinessMemoryState {
  /** Keyed by lower-cased username. */
  profiles: Map<string, BusinessProfile>;
}

export function createBusinessMemoryState(
  seed: BusinessSeed | null
): BusinessMemoryState {
  return {
    profiles: new Map(
      (seed?.profiles ?? []).map((profile) => [
        profile.username.toLowerCase(),
        { ...profile, managers: [...profile.managers] },
      ])
    ),
  };
}

export const createMemoryBusiness: (
  deps: MemoryDeps
) => BusinessRepository = () => unbuiltBusiness();
