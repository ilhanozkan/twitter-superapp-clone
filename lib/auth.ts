import { IAuthor, IUserProfile } from "../types/User";
import { USERNAME_PATTERN } from "./constants";
import { ConfigurationError, getRepository } from "./db";
import { DEMO_USERNAME } from "./db/seed";

// There is no sign-in yet: every request acts as one configured account
// (DEMO_USERNAME, the repository owner by default). This module is the only
// place that decides who the caller is, so real authentication can replace
// it without touching the API routes. Identity is never read from requests.

export function getCurrentUsername(
  env: Record<string, string | undefined> = process.env
): string {
  const username = env.DEMO_USERNAME?.trim() || DEMO_USERNAME;

  if (!USERNAME_PATTERN.test(username)) {
    throw new ConfigurationError(
      `DEMO_USERNAME "${username}" is not a valid username`
    );
  }
  return username;
}

/**
 * READ_ONLY=true turns every write into a 403. Without sign-in every visitor
 * acts as DEMO_USERNAME, so public deployments with a write token should
 * enable it (or add authentication).
 */
export function isReadOnly(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.READ_ONLY === "true";
}

/** The current user's profile; a minimal one if the data source has none yet. */
export async function getCurrentProfile(): Promise<IUserProfile> {
  const username = getCurrentUsername();
  const profile = await getRepository().getUser(username);

  return (
    profile ?? {
      username,
      fullname: username,
      image: null,
      banner: null,
      bio: null,
      location: null,
      website: null,
      verified: false,
      joinedAt: new Date().toISOString(),
      tweetCount: 0,
    }
  );
}

/** The identity stamped on tweets, replies and reactions the current user creates. */
export async function getCurrentUser(): Promise<IAuthor> {
  const { username, fullname, image } = await getCurrentProfile();
  return { username, fullname, image };
}
