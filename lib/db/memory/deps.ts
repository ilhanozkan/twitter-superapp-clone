import { LIMITS } from "../../superapp/limits";
import type { MemoryState } from "../memory";
import { Repository } from "../types";
import { MemoryLedger } from "./ledger";

/**
 * Caps that keep the demo store's memory bounded. Tweets, replies, text
 * messages, stories and story views drop the oldest first. Records that
 * carry money (transfers, payment requests, orders, rides) are never
 * evicted: past their cap, new ones are refused with LimitExceededError.
 */
export interface MemoryLimits {
  tweets: number;
  replies: number;
  transfers: number;
  paymentRequests: number;
  orders: number;
  rides: number;
  messages: number;
  stories: number;
  storyViews: number;
}

export const DEFAULT_MEMORY_LIMITS: MemoryLimits = {
  tweets: 2000,
  replies: 5000,
  transfers: LIMITS.ledgerCapacity,
  paymentRequests: 10_000,
  orders: 10_000,
  rides: 10_000,
  messages: 20_000,
  stories: 2_000,
  storyViews: 20_000,
};

/** What every memory sub-repository is built from. */
export interface MemoryDeps {
  state: MemoryState;
  now: () => Date;
  generateId: () => string;
  timeScale: number;
  limits: MemoryLimits;
  ledger: MemoryLedger;
  /** Async cross-feature reads OUTSIDE ledger critical sections only. */
  self: () => Repository;
}
