import { ConfigurationError } from "../errors";
import { Repository } from "../types";
import { assertPublishedFilter } from "./groq";
import { SanityLedger } from "./ledger";
import { SanityClientLike } from "./repository";

/** What every Sanity sub-repository is built from. */
export interface SanityDeps {
  /** "raw" perspective: every SuperApp read and write goes through it. */
  client: SanityClientLike;
  canWrite: boolean;
  /** Private documents need a token; without one, private features are unconfigured. */
  canReadPrivate: boolean;
  now: () => Date;
  generateId: () => string;
  /** Backoff between ledger retries. */
  sleep: (ms: number) => Promise<void>;
  timeScale: number;
  ledger: SanityLedger;
  /** Throws ConfigurationError without a write token. */
  assertWritable(): void;
  /** A SuperApp read. Under test, queries without the PUBLISHED filter throw. */
  read<T>(query: string, params?: Record<string, unknown>): Promise<T>;
  /** Async cross-feature reads. */
  self: () => Repository;
}

export function assertWritable(canWrite: boolean): void {
  if (!canWrite) {
    throw new ConfigurationError(
      "SANITY_API_TOKEN is not set, so the Sanity data source is read-only."
    );
  }
}

export function createRead(client: SanityClientLike): SanityDeps["read"] {
  return async <T>(query: string, params: Record<string, unknown> = {}) => {
    if (process.env.NODE_ENV === "test") assertPublishedFilter(query);
    return client.fetch<T>(query, params);
  };
}
