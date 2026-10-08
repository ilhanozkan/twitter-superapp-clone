import { getDataSource, getSanityConfig } from "../config";
import { createMemoryRepository, getMemoryState } from "./memory";
import { createSanityClient } from "./sanity/client";
import { createSanityRepository } from "./sanity/repository";
import { Repository } from "./types";

export type { Repository, ListTweetsQuery, NewReply, NewTweet } from "./types";
export { ConfigurationError, NotFoundError } from "./errors";

let repository: Repository | undefined;

function createRepository(): Repository {
  if (getDataSource() === "sanity") {
    const config = getSanityConfig();
    return createSanityRepository(createSanityClient(config), {
      canWrite: !!config.token,
    });
  }

  return createMemoryRepository(getMemoryState());
}

/** The repository for the configured data source (server-side only). */
export function getRepository(): Repository {
  if (!repository) repository = createRepository();
  return repository;
}
