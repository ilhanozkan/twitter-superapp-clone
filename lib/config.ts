import { ConfigurationError } from "./db/errors";

export type DataSource = "memory" | "sanity";

type Env = Record<string, string | undefined>;

export interface SanityConfig {
  projectId: string;
  dataset: string;
  apiVersion: string;
  token: string | undefined;
}

// 2025-02-19 is the API version where "published" became the default
// perspective; we also set it explicitly so drafts never leak into the feed.
export const SANITY_API_VERSION = "2025-02-19";

function read(env: Env, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

/**
 * Picks where data lives. `DATA_SOURCE` wins when set; otherwise Sanity is
 * used as soon as a project id is configured, and the bundled in-memory demo
 * store is used when nothing is configured (fresh clones, CI, previews).
 */
export function getDataSource(env: Env = process.env): DataSource {
  const explicit = read(env, "DATA_SOURCE")?.toLowerCase();

  if (explicit === "memory" || explicit === "sanity") return explicit;
  if (explicit) {
    throw new ConfigurationError(
      `Invalid DATA_SOURCE "${explicit}". Expected "memory" or "sanity".`
    );
  }

  return read(env, "SANITY_PROJECT_ID", "NEXT_PUBLIC_SANITY_PROJECT_ID")
    ? "sanity"
    : "memory";
}

export function getSanityConfig(env: Env = process.env): SanityConfig {
  const projectId = read(
    env,
    "SANITY_PROJECT_ID",
    "NEXT_PUBLIC_SANITY_PROJECT_ID"
  );

  if (!projectId) {
    throw new ConfigurationError(
      'DATA_SOURCE is "sanity" but SANITY_PROJECT_ID is not set. ' +
        "Set it (see .env.example) or unset DATA_SOURCE to use the demo store."
    );
  }

  return {
    projectId,
    dataset:
      read(env, "SANITY_DATASET", "NEXT_PUBLIC_SANITY_DATASET") ?? "production",
    apiVersion: SANITY_API_VERSION,
    token: read(env, "SANITY_API_TOKEN"),
  };
}
