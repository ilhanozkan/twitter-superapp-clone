import type { NextApiRequest } from "next";
import { z } from "zod";

import { MAX_PAGE_SIZE } from "../constants";
import { getRepository } from "../db";
import { FEATURE_LABELS } from "../superapp/features";
import { LIMITS } from "../superapp/limits";
import { IConversation } from "../../types/Message";
import { ApiError, notFound } from "./errors";
import {
  cents,
  cursorParam,
  limitParam,
  note,
  plainText,
  recordKey,
  routeKey,
  username,
} from "./validation";

// Request schemas and shared steps of /api/conversations/**. Bodies never
// name the author, sender or requester: the acting user always comes from
// lib/auth.ts, and unknown fields are dropped by the schemas.

/** POST /api/conversations: who to talk to. */
export const openConversationBody = z.object({ with: username });

/**
 * A chat message: 1 to 1,000 characters of text, or a shared Tweet with
 * optional text. `storyId` makes it a reply to that story.
 */
export const messageBody = z
  .object({
    text: plainText({
      max: LIMITS.messageMax,
      allowEmpty: true,
      label: "Text",
    }).default(""),
    tweetId: recordKey("Tweet id").nullish(),
    storyId: recordKey("Story id").nullish(),
  })
  .superRefine((body, ctx) => {
    if (!body.text && !body.tweetId) {
      ctx.addIssue({
        code: "custom",
        path: ["text"],
        message: "Text cannot be empty",
      });
    }
  });

/** A payment or a payment request in a conversation; the other member is the payee or payer. */
export const chatMoneyBody = z.object({
  amount: cents(LIMITS.payment.min, LIMITS.payment.max),
  note: note(LIMITS.noteMax),
});

/**
 * Chat payments and requests move the wallet's credits, so they follow the
 * wallet's switch too, not only the messages one: while the wallet is off
 * (DISABLED_FEATURES=wallet) or unconfigured they answer the way
 * createHandler does for a feature (404, or 503).
 */
export function assertWalletOn() {
  const status = getRepository().featureStatus("wallet");
  if (status === "off") throw notFound("This feature is turned off");
  if (status === "unconfigured") {
    throw new ApiError(
      503,
      "service_unavailable",
      `${FEATURE_LABELS.wallet} needs SANITY_API_TOKEN on this deployment`
    );
  }
}

/** `?before=` (older) or `?after=` (newer) a cursor, and `limit` ≤ 50. */
export const messagesQuery = z
  .object({
    before: cursorParam.optional(),
    after: cursorParam.optional(),
    limit: limitParam(MAX_PAGE_SIZE),
  })
  .superRefine((query, ctx) => {
    if (query.before && query.after) {
      ctx.addIssue({
        code: "custom",
        path: ["after"],
        message: "Use before or after, not both",
      });
    }
  });

/** The `[id]` param: a conversation key (dot-free); anything else is not found. */
export const conversationKey = (req: NextApiRequest) =>
  routeKey(req, "id", "Conversation not found");

export const conversationLocation = (conversation: IConversation) =>
  `/api/conversations/${encodeURIComponent(conversation.id)}`;
