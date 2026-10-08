import { createClient } from "@sanity/client";

import { SanityConfig } from "../../config";
import { SanityClientLike } from "./repository";

export function createSanityClient(config: SanityConfig): SanityClientLike {
  return createClient({
    projectId: config.projectId,
    dataset: config.dataset,
    apiVersion: config.apiVersion,
    token: config.token,
    // The feed must show a tweet right after it is posted, so skip the CDN cache.
    useCdn: false,
    perspective: "published",
  }) as unknown as SanityClientLike;
}
