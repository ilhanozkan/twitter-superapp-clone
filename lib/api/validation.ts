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
import { ApiError, notFound } from "./errors";
import { headerValue } from "./handler";

// Control characters other than tab and newline never belong in a tweet.
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B-\u001F\u007F]/g;

export const tweetText = z
  .string({ error: "Text is required" })
  .transform((text) =>
    text
      .replace(/\r\n?/g, "\n")
      .replace(CONTROL_CHARACTERS, "")
      .normalize("NFC")
      .trim()
  )
  .refine((text) => text.length > 0, "Text cannot be empty")
  .refine(
    (text) => textLength(text) <= TWEET_MAX_LENGTH,
    `Text must be at most ${TWEET_MAX_LENGTH} characters`
  );

/** https URLs, or paths served by this app ("/media/x.svg"); never javascript:, data: or //host. */
export function isSafeImageUrl(value: string): boolean {
  if (value.startsWith("/"))
    return !value.startsWith("//") && !value.includes("\\");
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export const imageUrl = z
  .string()
  .trim()
  .max(2048, "Image URL is too long")
  .refine(isSafeImageUrl, "Image must be an https URL or a path on this site");

const username = z.string().regex(USERNAME_PATTERN, "Invalid username");

export const createTweetBody = z.object({
  text: tweetText,
  image: imageUrl.nullish(),
});

export const createReplyBody = z.object({ text: tweetText });

const limit = (max: number) =>
  z.coerce.number().int().min(1).max(max).optional();

export const listTweetsQuery = z.object({
  author: username.optional(),
  q: z.string().trim().max(100).optional(),
  likedBy: username.optional(),
  bookmarked: z.enum(["true", "false"]).optional(),
  limit: limit(MAX_PAGE_SIZE),
  cursor: z
    .string()
    .max(256)
    .refine((value) => decodeCursor(value) !== null, "Invalid cursor")
    .optional(),
});

export const limitQuery = (max = DEFAULT_NOTIFICATIONS_LIMIT) =>
  z.object({ limit: limit(max) });

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

export function routeUsername(req: NextApiRequest): string {
  const value = req.query.username;
  if (typeof value !== "string" || !USERNAME_PATTERN.test(value)) {
    throw notFound("User not found");
  }
  return value;
}
