import type { NextApiRequest } from "next";
import { z } from "zod";

import {
  DEFAULT_NOTIFICATIONS_LIMIT,
  MAX_PAGE_SIZE,
  textLength,
  TWEET_MAX_LENGTH,
  USERNAME_PATTERN,
} from "../constants";
import { decodeCursor } from "../db/cursor";
import { KEY_PATTERN } from "../db/sanity/ids";
import { isSafeImageUrl } from "../imageUrl";
import { formatAmount } from "../superapp/money";
import { PLACES } from "../superapp/places";
import { Cents } from "../../types/Money";
import { PlaceId } from "../../types/Superapp";
import { ApiError, notFound } from "./errors";
import { headerValue } from "./handler";

// Control characters other than tab and newline (C0, DEL and C1) never
// belong in a tweet. Neither do bidi embeddings, overrides and isolates
// (U+202A-U+202E, U+2066-U+2069): they can make text, links included, read
// as something else ("https://x.co/\u202Emoc.lapyap" displays as paypal.com).
// The left-to-right and right-to-left marks stay; RTL writing needs them.
const CONTROL_CHARACTERS =
  /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g;

const sanitize = (text: string) =>
  text
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARACTERS, "")
    .normalize("NFC")
    .trim();

/**
 * User-written text (Tweets, notes, messages...): line endings normalized,
 * control and bidi characters stripped, NFC, trimmed, and at most `max`
 * code points. `label` names the field in error messages.
 */
export function plainText({
  max,
  allowEmpty = false,
  label = "Text",
}: {
  max: number;
  allowEmpty?: boolean;
  label?: string;
}) {
  return z
    .string({
      error: allowEmpty ? `${label} must be text` : `${label} is required`,
    })
    .transform(sanitize)
    .refine((text) => allowEmpty || text.length > 0, `${label} cannot be empty`)
    .refine(
      (text) => textLength(text) <= max,
      `${label} must be at most ${max} characters`
    );
}

export const tweetText = plainText({ max: TWEET_MAX_LENGTH });

/** An optional note on a payment or request: sanitized text, or null when missing or blank. */
export const note = (max: number) =>
  plainText({ max, allowEmpty: true, label: "Note" })
    .nullish()
    .transform((text) => text || null);

/**
 * An amount in cents: a JSON integer within [min, max]. Floats, strings,
 * zero and negatives never pass, so "12.50" can't be misread as 12 or 1250.
 */
export const cents = (min: Cents, max: Cents) =>
  z
    .number({ error: "Amount must be a number of cents" })
    .int("Amount must be a whole number of cents")
    .min(min, `Amount must be at least ${formatAmount(min)} credits`)
    .max(max, `Amount must be at most ${formatAmount(max)} credits`);

export { isSafeImageUrl };

export const imageUrl = z
  .string()
  .trim()
  .max(2048, "Image URL is too long")
  .refine(isSafeImageUrl, "Image must be an https URL or a path on this site");

/** "<what> is required" when missing, `invalid` for anything that is not a string. */
const typeError =
  (what: string, invalid: string) => (issue: { input: unknown }) =>
    issue.input === undefined ? `${what} is required` : invalid;

export const username = z
  .string({ error: typeError("Username", "Invalid username") })
  .regex(USERNAME_PATTERN, "Invalid username");

export const placeId = z.enum(
  PLACES.map((place) => place.id) as [PlaceId, ...PlaceId[]],
  { error: "Unknown place" }
);

/** A record key as the API accepts it: dot-free, so it can never name a private path id. */
export const recordKey = (label: string) => {
  const invalid = `Invalid ${label.toLowerCase()}`;
  return z
    .string({ error: typeError(label, invalid) })
    .regex(KEY_PATTERN, invalid);
};

export const createTweetBody = z.object({
  text: tweetText,
  image: imageUrl.nullish(),
  attachment: z
    .object({ type: z.literal("product"), productId: recordKey("Product id") })
    .nullish(),
});

export const createReplyBody = z.object({ text: tweetText });

export const limitParam = (max: number) =>
  z.coerce.number().int().min(1).max(max).optional();

/** A `nextCursor` from a previous page. */
export const cursorParam = z
  .string()
  .max(256)
  .refine((value) => decodeCursor(value) !== null, "Invalid cursor");

/** `?limit=1..50&cursor=` */
export const pageQuery = z.object({
  limit: limitParam(MAX_PAGE_SIZE),
  cursor: cursorParam.optional(),
});

export const listTweetsQuery = z.object({
  author: username.optional(),
  q: z.string().trim().max(100).optional(),
  likedBy: username.optional(),
  bookmarked: z.enum(["true", "false"]).optional(),
  limit: limitParam(MAX_PAGE_SIZE),
  cursor: cursorParam.optional(),
});

export const limitQuery = (max = DEFAULT_NOTIFICATIONS_LIMIT) =>
  z.object({ limit: limitParam(max) });

/** Parses query params; repeated params (arrays) fail validation instead of being guessed. */
export function parseQuery<T extends z.ZodType>(
  req: NextApiRequest,
  schema: T
): z.output<T> {
  return schema.parse(req.query);
}

/**
 * Parses a JSON body. Requiring `Content-Type: application/json` also makes
 * cross-site form posts impossible: browsers must send a CORS preflight for
 * it, which this API never approves.
 */
export function parseBody<T extends z.ZodType>(
  req: NextApiRequest,
  schema: T
): z.output<T> {
  const contentType = headerValue(req.headers["content-type"])
    ?.split(";")[0]
    .trim()
    .toLowerCase();

  if (contentType !== "application/json") {
    throw new ApiError(
      415,
      "unsupported_media_type",
      "Send the body as application/json"
    );
  }

  const body = req.body;
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "bad_request", "The body must be a JSON object");
  }

  return schema.parse(body);
}

const DOCUMENT_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** The `[id]` route param. Anything that cannot be an id is reported as not found. */
export function routeId(req: NextApiRequest): string {
  const id = req.query.id;
  if (typeof id !== "string" || !DOCUMENT_ID.test(id))
    throw notFound("Tweet not found");
  return id;
}

/**
 * A route param naming a SuperApp record. Only dot-free keys are accepted,
 * so a request can never address a `private.` path id or a draft; anything
 * else is reported as not found, like a missing record.
 */
export function routeKey(
  req: NextApiRequest,
  name: string,
  notFoundMessage: string
): string {
  const value = req.query[name];
  if (typeof value !== "string" || !KEY_PATTERN.test(value)) {
    throw notFound(notFoundMessage);
  }
  return value;
}

export function routeUsername(req: NextApiRequest): string {
  const value = req.query.username;
  if (typeof value !== "string" || !USERNAME_PATTERN.test(value)) {
    throw notFound("User not found");
  }
  return value;
}
