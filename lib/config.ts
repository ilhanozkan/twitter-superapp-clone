import { FeatureId } from "../types/Superapp";
import { ConfigurationError } from "./db/errors";
import { parseFeatureList } from "./superapp/features";

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

const MAX_TIME_SCALE = 600;

/**
 * SUPERAPP_TIME_SCALE speeds up demo orders and rides (1 to 600, default 1;
 * the e2e suite uses 60). Repositories apply it when a record is created,
 * so stored timestamps are absolute and old records never change speed.
 */
export function getTimeScale(env: Env = process.env): number {
  const value = read(env, "SUPERAPP_TIME_SCALE");
  if (value === undefined) return 1;

  const scale = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!(scale >= 1 && scale <= MAX_TIME_SCALE)) {
    throw new ConfigurationError(
      `Invalid SUPERAPP_TIME_SCALE "${value}". Expected an integer from 1 to ${MAX_TIME_SCALE}.`
    );
  }
  return scale;
}

/**
 * DISABLED_FEATURES is a kill switch: a comma- or space-separated list of
 * SuperApp features (wallet, messages, channels, shop, orders, rides,
 * stories) to turn off. Unknown names are rejected rather than ignored.
 */
export function getDisabledFeatures(env: Env = process.env): Set<FeatureId> {
  const { features, unknown } = parseFeatureList(
    read(env, "DISABLED_FEATURES")
  );
  if (unknown.length > 0) {
    throw new ConfigurationError(
      `Unknown DISABLED_FEATURES: ${unknown.join(", ")}.`
    );
  }
  return features;
}
