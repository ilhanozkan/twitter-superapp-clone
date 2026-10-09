import { createClient } from "@sanity/client";

import { SanityConfig } from "../../config";
import { SanityClientLike } from "./repository";

export interface SanityClients {
  /** Core documents (users, Tweets, replies, reactions). */
  content: SanityClientLike;
  /** Every SuperApp read and write. */
  superapp: SanityClientLike;
}

export function createSanityClients(config: SanityConfig): SanityClients {
  const base = {
    projectId: config.projectId,
    dataset: config.dataset,
    apiVersion: config.apiVersion,
    token: config.token,
    // The feed must show a tweet right after it is posted, so skip the CDN cache.
    useCdn: false,
  };

  return {
    content: createClient({
      ...base,
      perspective: "published",
    }) as unknown as SanityClientLike,
    // Private SuperApp documents use "private." path ids. Whether the
    // published perspective returns path documents is unverified offline;
    // "raw" returns them to token holders and hides them from anonymous
    // reads. Raw also returns drafts, so every SuperApp query excludes them
    // itself (PUBLISHED in ./groq).
    superapp: createClient({
      ...base,
      perspective: "raw",
    }) as unknown as SanityClientLike,
  };
}
