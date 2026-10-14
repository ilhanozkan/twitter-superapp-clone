import { assertActorLimit } from "../../../../lib/api/actorLimits";
import { createHandler } from "../../../../lib/api/handler";
import {
  parseIdempotency,
  sendMoneyResult,
} from "../../../../lib/api/idempotency";
import {
  assertConversationOn,
  conversationKey,
  messageBody,
  messagesQuery,
} from "../../../../lib/api/messages";
import { parseBody, parseQuery } from "../../../../lib/api/validation";
import { getCurrentUser, getCurrentUsername } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/db";
import { isChannelConversationId } from "../../../../lib/superapp/messages";
import {
  MessagePageResponse,
  MessageResponse,
} from "../../../../types/Message";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default createHandler(
  {
    // GET /api/conversations/:id/messages?before=|after=&limit= — a page,
    // oldest to newest. Polls pass the last page's `newestCursor` as `after`.
    async GET(req, res) {
      const id = conversationKey(req);
      assertConversationOn(id);
      const query = parseQuery(req, messagesQuery);
      const page: MessagePageResponse =
        await getRepository().messages.listMessages(
          id,
          getCurrentUsername(),
          query
        );

      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json(page);
    },

    // POST /api/conversations/:id/messages { text, tweetId?, storyId? } with
    // an Idempotency-Key, so a retried send never posts twice.
    async POST(req, res) {
      const id = conversationKey(req);
      assertConversationOn(id);
      const body = parseBody(req, messageBody);
      const tweetId = body.tweetId ?? null;
      // Story replies are direct messages: a channel drops `storyId`, as
      // its own route does, so both routes make the same send.
      const storyId = isChannelConversationId(id)
        ? null
        : (body.storyId ?? null);
      const key = parseIdempotency(req, {
        scope: "messages.send",
        prefix: "msg",
        payload: { conversationId: id, text: body.text, tweetId, storyId },
      });
      const author = await getCurrentUser();
      assertActorLimit("messages", author.username);

      const { message, replayed } = await getRepository().messages.sendMessage({
        ...key,
        conversationId: id,
        author,
        text: body.text,
        tweetId,
        storyId,
      });

      sendMoneyResult<MessageResponse>(res, 201, { message }, replayed);
    },
  },
  { feature: "messages" }
);
