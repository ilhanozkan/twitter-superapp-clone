import {
  getDataSource,
  getDisabledFeatures,
  getSanityConfig,
  getTimeScale,
} from "../config";
import { createMemoryRepository, getMemoryState } from "./memory";
import { createSanityClients } from "./sanity/client";
import { createSanityRepository } from "./sanity/repository";
import { Repository } from "./types";

export type { Repository, ListTweetsQuery, NewReply, NewTweet } from "./types";
export { ConfigurationError, NotFoundError } from "./errors";

let repository: Repository | undefined;

function createRepository(): Repository {
  const timeScale = getTimeScale();
  const disabled = getDisabledFeatures();

  if (getDataSource() === "sanity") {
    const config = getSanityConfig();
    const clients = createSanityClients(config);
    return createSanityRepository(clients.content, {
      canWrite: !!config.token,
      superappClient: clients.superapp,
      timeScale,
      disabled,
    });
  }

  return createMemoryRepository(getMemoryState(), { timeScale, disabled });
}

/** The repository for the configured data source (server-side only). */
export function getRepository(): Repository {
  if (!repository) repository = createRepository();
  return repository;
}
