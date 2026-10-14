import type { NextApiRequest } from "next";
import { z } from "zod";

import { MAX_PAGE_SIZE } from "../constants";
import { getRepository } from "../db";
import { FEATURE_LABELS } from "../superapp/features";
import { LIMITS } from "../superapp/limits";
import {
  CHANNEL_HANDLE_PATTERN,
  parseChannelHandle,
} from "../superapp/messages";
import { IChannel, IConversation } from "../../types/Message";
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

// Channels (/api/channels/**) ride on the same engine.

/** `?q=` (searches handle, name and description) and `member=true` (yours only). */
export const channelsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  member: z.enum(["true", "false"]).optional(),
});

/** POST /api/channels: the creator is the owner, from lib/auth.ts. */
export const createChannelBody = z.object({
  handle: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Handle is required" : "Invalid handle",
    })
    .trim()
    .regex(
      CHANNEL_HANDLE_PATTERN,
      "Handles are 3 to 30 lower-case letters, digits or _"
    ),
  name: plainText({ max: LIMITS.channels.nameMax, label: "Name" }),
  description: plainText({
    max: LIMITS.channels.descriptionMax,
    allowEmpty: true,
    label: "Description",
  })
    .nullish()
    .transform((text) => text || null),
});

/** PUT …/members/:username/role: the owner makes or unmakes a moderator. */
export const roleBody = z.object({
  role: z.enum(["moderator", "member"], {
    error: 'Role must be "moderator" or "member"',
  }),
});

/**
 * A channel message: text (1 to 1,000 characters), or a shared Tweet with
 * optional text. Story replies belong in direct messages, so a `storyId`
 * is dropped like any unknown field.
 */
export const channelMessageBody = z
  .object({
    text: plainText({
      max: LIMITS.messageMax,
      allowEmpty: true,
      label: "Text",
    }).default(""),
    tweetId: recordKey("Tweet id").nullish(),
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

/** The `[handle]` param, in the one case handles are stored in; anything else is not found. */
export function channelHandle(req: NextApiRequest): string {
  const handle = parseChannelHandle(req.query.handle);
  if (!handle) throw notFound("Channel not found");
  return handle;
}

/** The `[messageId]` param: a message key (dot-free). */
export const channelMessageKey = (req: NextApiRequest) =>
  routeKey(req, "messageId", "Message not found");

export const channelLocation = (channel: IChannel) =>
  `/api/channels/${encodeURIComponent(channel.handle)}`;

/** A channel as `viewer` sees it, or 404. */
export async function findChannel(
  handle: string,
  viewer: string
): Promise<IChannel> {
  const channel = await getRepository().channels.getChannel(handle, viewer);
  if (!channel) throw notFound("Channel not found");
  return channel;
}
