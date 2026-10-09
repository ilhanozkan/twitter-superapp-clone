import { notFound } from "../../../../lib/api/errors";
import { createHandler } from "../../../../lib/api/handler";
import { conversationKey } from "../../../../lib/api/messages";
import { getCurrentUsername } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/db";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

export default createHandler(
  {
    // PUT /api/conversations/:id/read — marks everything so far as read.
    // Idempotent; the read marker never moves back.
    async PUT(req, res) {
      const id = conversationKey(req);
      const viewer = getCurrentUsername();
      const messages = getRepository().messages;
      if (!(await messages.getConversation(id, viewer))) {
        throw notFound("Conversation not found");
      }

      await messages.markRead(id, viewer);
      res.status(204).end();
    },
  },
  { feature: "messages" }
);
