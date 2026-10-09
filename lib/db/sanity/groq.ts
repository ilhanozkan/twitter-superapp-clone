// Rules for every SuperApp query (the core queries in ./queries predate them):
// - filter by `_type` and include PUBLISHED: the superapp client reads the
//   "raw" perspective, which would otherwise return drafts and versions;
// - never call now(): `$now` comes from the injected clock, so tests and the
//   memory store agree on time;
// - pass values as params; only validated integers are interpolated.

export const PUBLISHED = `!(_id in path("drafts.**")) && !(_id in path("versions.**"))`;

/** Throws when a SuperApp query forgets PUBLISHED. Run on every read in tests. */
export function assertPublishedFilter(query: string): void {
  if (!query.includes(PUBLISHED)) {
    throw new Error(`SuperApp query without the PUBLISHED filter: ${query}`);
  }
}
