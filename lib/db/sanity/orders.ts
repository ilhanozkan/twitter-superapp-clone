import { OrdersRepository } from "../orders/types";
import { unbuiltOrders } from "../stubs";
import { SanityDeps } from "./deps";

// Stub: the orders lane replaces this file. Orders documents are private, so the
// feature needs a token to read them.

export function createSanityOrders(deps: SanityDeps): OrdersRepository {
  return unbuiltOrders(deps.canReadPrivate);
}
