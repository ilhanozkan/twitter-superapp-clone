import { SeedData } from "../../seed";
import { orderDocument } from "../orders";
import { SanitySeedDocument } from "./documents";

// Orders are private documents ("private." ids), written exactly as the app
// writes them; their payments are in the wallet export with every transfer.

export function ordersSanityDocuments(seed: SeedData): SanitySeedDocument[] {
  return (seed.superapp?.orders?.orders ?? []).map((order) => ({
    ...orderDocument(order),
    _createdAt: order.placedAt,
  }));
}
