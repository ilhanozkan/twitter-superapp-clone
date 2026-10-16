import { forbidden, notFound } from "../../../../../lib/api/errors";
import { assertActorLimit } from "../../../../../lib/api/actorLimits";
import { createHandler } from "../../../../../lib/api/handler";
import {
  parseIdempotency,
  sendMoneyResult,
} from "../../../../../lib/api/idempotency";
import {
  channelHandle,
  channelMessageBody,
  findChannel,
  messagesQuery,
} from "../../../../../lib/api/messages";
import { parseBody, parseQuery } from "../../../../../lib/api/validation";
import { getCurrentUser, getCurrentUsername } from "../../../../../lib/auth";
import { getRepository } from "../../../../../lib/db";
import { NotFoundError } from "../../../../../lib/db/errors";
import { channelConversationId } from "../../../../../lib/superapp/messages";
import { canPost } from "../../../../../lib/superapp/policy/messages";
import {
  MessagePageResponse,
  MessageResponse,
} from "../../../../../types/Message";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default createHandler(
  {
    // GET /api/channels/:handle/messages?before=|after=&limit= — public: a
    // page, oldest to newest, exactly like a conversation's.
    async GET(req, res) {
      const handle = channelHandle(req);
      const query = parseQuery(req, messagesQuery);
      let page: MessagePageResponse;
      try {
        page = await getRepository().messages.listMessages(
          channelConversationId(handle),
          getCurrentUsername(),
          query
        );
      } catch (error) {
        // The only thing a page read can miss is the channel itself.
        if (error instanceof NotFoundError) throw notFound("Channel not found");
        throw error;
      }

      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json(page);
    },

    // POST /api/channels/:handle/messages { text, tweetId? } with an
    // Idempotency-Key — members only (403 for everyone else).
    async POST(req, res) {
      const handle = channelHandle(req);
      const body = parseBody(req, channelMessageBody);
      const conversationId = channelConversationId(handle);
      const tweetId = body.tweetId ?? null;
      const key = parseIdempotency(req, {
        scope: "messages.send",
        prefix: "msg",
        payload: { conversationId, text: body.text, tweetId, storyId: null },
      });
      const author = await getCurrentUser();
      // Checked again inside the write; here so a refusal is free.
      const { viewer } = await findChannel(handle, author.username);
      if (!canPost(viewer.role)) {
        throw forbidden("Join this channel to send messages");
      }
      assertActorLimit("messages", author.username);

      const { message, replayed } = await getRepository().messages.sendMessage({
        ...key,
        conversationId,
        author,
        text: body.text,
        tweetId,
        storyId: null,
      });
      sendMoneyResult<MessageResponse>(res, 201, { message }, replayed);
    },
  },
  { feature: "channels" }
);
