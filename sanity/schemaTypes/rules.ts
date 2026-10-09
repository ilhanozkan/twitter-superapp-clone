import type { StringRule, UrlRule } from "sanity";

import { RESERVED_USERNAMES, TWEET_MAX_LENGTH, USERNAME_PATTERN } from "../env";

/** At most `max` characters, counted in Unicode code points like the app does. */
export const maxLength = (rule: StringRule, max: number) =>
  rule.custom((value: string | undefined) =>
    !value || Array.from(value).length <= max
      ? true
      : `Must be at most ${max} characters`
  );

/** Tweet-length text. */
export const tweetText = (rule: StringRule) =>
  maxLength(rule.required(), TWEET_MAX_LENGTH);

export const username = (rule: StringRule) =>
  rule.required().regex(USERNAME_PATTERN, {
    name: "handle (letters, digits and _, at most 15 characters)",
  });

/** A profile URL (/<username>) must not collide with one of the app's pages. */
export const notReserved = (rule: StringRule) =>
  rule.custom((value: string | undefined) =>
    value && RESERVED_USERNAMES.includes(value.toLowerCase())
      ? "This name is reserved for a page of the app"
      : true
  );

/** Absolute http(s) URLs, or paths served by the app such as /avatars/me.svg. */
export const imageUrl = (rule: UrlRule) =>
  rule.uri({ allowRelative: true, scheme: ["http", "https"] });
