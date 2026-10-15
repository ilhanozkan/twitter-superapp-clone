import {
  compareBusinesses,
  managedBusinesses,
  toBusiness,
} from "../../superapp/business";
import { IBusiness } from "../../../types/Business";
import { IAuthor } from "../../../types/User";
import { BusinessProfile, BusinessRepository } from "../business/types";
import { NotFoundError } from "../errors";
import { BUSINESS_QUERY, BUSINESSES_QUERY } from "./businessQueries";
import { SanityDeps } from "./deps";

interface BusinessRow extends BusinessProfile {
  _id: string;
  user: (IAuthor & { accountType: string }) | null;
  frozen: boolean;
}

/**
 * Businesses on Sanity: public businessProfile documents (edited in
 * Studio) joined with their user record, which must say
 * `accountType: "business"`. Readable without a token.
 */
export function createSanityBusiness(deps: SanityDeps): BusinessRepository {
  const toDto = (row: BusinessRow | null): IBusiness | null => {
    if (!row?.user || row.user.accountType !== "business") return null;
    const { _id, user, frozen, ...profile } = row;
    void _id;
    return toBusiness(
      profile,
      {
        username: user.username,
        fullname: user.fullname,
        image: user.image ?? null,
      },
      frozen,
      deps.now()
    );
  };

  const readOne = (username: string) =>
    deps.read<BusinessRow | null>(BUSINESS_QUERY, {
      username: username.toLowerCase(),
    });

  const all = async () =>
    ((await deps.read<BusinessRow[]>(BUSINESSES_QUERY)) ?? [])
      .map(toDto)
      .filter((business): business is IBusiness => business !== null)
      .sort(compareBusinesses);

  return {
    async getBusiness(username) {
      return toDto(await readOne(username));
    },

    listBusinesses: all,

    async listManagedBusinesses(username) {
      return managedBusinesses(await all(), username);
    },

    async setAcceptingOrders(username, accepting) {
      deps.assertWritable();
      const row = await readOne(username);
      if (!toDto(row)) throw new NotFoundError("Business not found");
      await deps.client.mutate(
        [{ patch: { id: row!._id, set: { acceptingOrders: accepting } } }],
        { visibility: "sync" }
      );
      return toDto({ ...row!, acceptingOrders: accepting })!;
    },
  };
}
