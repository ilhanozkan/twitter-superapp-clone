import type { StringRule, UrlRule } from "sanity";

import { TWEET_MAX_LENGTH, USERNAME_PATTERN } from "../env";

/** Tweet-length text, counted in Unicode code points like the app does. */
export const tweetText = (rule: StringRule) =>
  rule
    .required()
    .custom((value) =>
      !value || Array.from(value).length <= TWEET_MAX_LENGTH
        ? true
        : `Must be at most ${TWEET_MAX_LENGTH} characters`
    );

export const username = (rule: StringRule) =>
  rule.required().regex(USERNAME_PATTERN, {
    name: "handle (letters, digits and _, at most 15 characters)",
  });

/** Absolute http(s) URLs, or paths served by the app such as /avatars/me.svg. */
export const imageUrl = (rule: UrlRule) =>
  rule.uri({ allowRelative: true, scheme: ["http", "https"] });
