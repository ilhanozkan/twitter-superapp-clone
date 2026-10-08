/** Maximum length of a tweet or reply, counted in Unicode code points. */
export const TWEET_MAX_LENGTH = 280;

/** Twitter-style handles: letters, digits and underscores, at most 15 characters. */
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export const DEFAULT_TRENDS_LIMIT = 10;
export const DEFAULT_NOTIFICATIONS_LIMIT = 50;

/** Counts characters the way users see them (emoji and astral symbols count once). */
export function textLength(text: string): number {
  return Array.from(text).length;
}
