import {
  compareBusinesses,
  managedBusinesses,
  toBusiness,
} from "../../superapp/business";
import { IBusiness } from "../../../types/Business";
import { BusinessProfile, BusinessRepository } from "../business/types";
import { NotFoundError } from "../errors";
import { BusinessSeed } from "../seeds/business";
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

/**
 * A business is a user record with `accountType: "business"` plus a
 * profile. Its name and avatar always come from the user record.
 */
export function createMemoryBusiness(deps: MemoryDeps): BusinessRepository {
  const { state, now } = deps;

  const read = (profile: BusinessProfile | undefined): IBusiness | null => {
    if (!profile) return null;
    const key = profile.username.toLowerCase();
    const user = state.users.get(key);
    if (!user || user.accountType !== "business") return null;
    return toBusiness(
      profile,
      { username: user.username, fullname: user.fullname, image: user.image },
      state.wallet.frozen.has(key),
      now()
    );
  };

  const all = () =>
    [...state.business.profiles.values()]
      .map(read)
      .filter((business): business is IBusiness => business !== null)
      .sort(compareBusinesses);

  return {
    async getBusiness(username) {
      return read(state.business.profiles.get(username.toLowerCase()));
    },

    async listBusinesses() {
      return all();
    },

    async listManagedBusinesses(username) {
      return managedBusinesses(all(), username);
    },

    async setAcceptingOrders(username, accepting) {
      const profile = state.business.profiles.get(username.toLowerCase());
      if (!read(profile)) throw new NotFoundError("Business not found");
      profile!.acceptingOrders = accepting;
      return read(profile)!;
    },
  };
}
