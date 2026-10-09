import { IBusiness } from "../../../types/Business";

export interface BusinessRepository {
  /** null for personal accounts. */
  getBusiness(username: string): Promise<IBusiness | null>;
  /** By fullname. */
  listBusinesses(): Promise<IBusiness[]>;
  /** The user itself if a business, plus delegations. */
  listManagedBusinesses(username: string): Promise<string[]>;
  /** NotFoundError */
  setAcceptingOrders(username: string, accepting: boolean): Promise<IBusiness>;
}

/**
 * A business profile as stored: everything in IBusiness except what comes
 * from the user record (name, avatar) and what is derived at read time.
 */
export type BusinessProfile = Omit<
  IBusiness,
  "fullname" | "image" | "status" | "etaMinutes"
>;
