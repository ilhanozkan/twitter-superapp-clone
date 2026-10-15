import { OrdersRepository } from "../orders/types";
import { OrdersSeed } from "../seeds/orders";
import { unbuiltOrders } from "../stubs";
import { MemoryDeps } from "./deps";

// Stub: the orders lane replaces this file.

export type OrdersMemoryState = Record<string, never>;

export const createOrdersMemoryState: (
  seed: OrdersSeed | null
) => OrdersMemoryState = () => ({});

export const createMemoryOrders: (deps: MemoryDeps) => OrdersRepository = () =>
  unbuiltOrders(true);
