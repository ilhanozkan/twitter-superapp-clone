import { notFound } from "../../../../lib/api/errors";
import { createHandler } from "../../../../lib/api/handler";
import { conversationKey } from "../../../../lib/api/messages";
import { getCurrentUsername } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/db";
import { ConversationResponse } from "../../../../types/Message";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

export default createHandler(
  {
    // GET /api/conversations/:id — only its two members can read it; anyone
    // else gets 404, so ids reveal nothing.
    async GET(req, res) {
      const id = conversationKey(req);
      const conversation = await getRepository().messages.getConversation(
        id,
        getCurrentUsername()
      );
      if (!conversation) throw notFound("Conversation not found");

      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json({ conversation } satisfies ConversationResponse);
    },
  },
  { feature: "messages" }
);
