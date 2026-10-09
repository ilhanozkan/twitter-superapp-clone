/** Maximum length of a tweet or reply, counted in Unicode code points. */
export const TWEET_MAX_LENGTH = 280;

/** Twitter-style handles: letters, digits and underscores, at most 15 characters. */
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

/**
 * Top-level routes a profile URL (/<username>) would collide with. No account
 * may use one: getCurrentUsername and the Studio reject them.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  "services",
  "wallet",
  "food",
  "checkout",
  "orders",
  "business",
  "rides",
  "stories",
  "channels",
  "messages",
  "explore",
  "notifications",
  "i",
  "api",
  "settings",
  "404",
  "500",
  "_next",
]);

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(username.toLowerCase());
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export const DEFAULT_TRENDS_LIMIT = 10;
export const DEFAULT_NOTIFICATIONS_LIMIT = 50;
export const DEFAULT_USER_SEARCH_LIMIT = 10;

/**
 * Counts Unicode code points, so astral symbols and most emoji count once.
 * Flags, skin tones and joined emoji are several code points and count as such.
 */
export function textLength(text: string): number {
  return Array.from(text).length;
}
