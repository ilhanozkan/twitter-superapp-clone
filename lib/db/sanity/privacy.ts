import { PRIVATE_TYPES } from "./ids";
import type { SanityClientLike } from "./repository";

// Private SuperApp documents must be invisible to requests without a token.
// This asks for them the way an anonymous visitor could: by type, and by
// path. Drafts and versions count too, so no PUBLISHED filter here.

export const PRIVACY_QUERY = `{
  "typed": *[_type in $privateTypes][0...1]._id,
  "paths": *[_id in path("private.**")][0...1]._id
}`;

/** Ids of private documents `client` can read; empty when the dataset keeps them private. */
export async function exposedPrivateDocuments(
  client: Pick<SanityClientLike, "fetch">
): Promise<string[]> {
  const found = await client.fetch<{ typed: string[]; paths: string[] }>(
    PRIVACY_QUERY,
    { privateTypes: [...PRIVATE_TYPES] }
  );
  return [...new Set([...(found?.typed ?? []), ...(found?.paths ?? [])])];
}
