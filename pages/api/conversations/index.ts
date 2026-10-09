import { createHandler } from "../../../lib/api/handler";
import {
  conversationLocation,
  openConversationBody,
} from "../../../lib/api/messages";
import { parseBody } from "../../../lib/api/validation";
import { assertNotSelf, findParty } from "../../../lib/api/wallet";
import { getCurrentUser, getCurrentUsername } from "../../../lib/auth";
import { getRepository } from "../../../lib/db";
import {
  ConversationResponse,
  ConversationsResponse,
} from "../../../types/Message";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default createHandler(
  {
    // GET /api/conversations — the current user's direct conversations,
    // most recently active first, each with its last message and unread count.
    async GET(req, res) {
      const body: ConversationsResponse = {
        items:
          await getRepository().messages.listConversations(
            getCurrentUsername()
          ),
      };

      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json(body);
    },

    // POST /api/conversations { with } — opens the direct conversation with
    // `with` (201, with a business's automatic greeting) or returns the
    // existing one (200). Opening is idempotent, so it takes no key.
    async POST(req, res) {
      const body = parseBody(req, openConversationBody);
      assertNotSelf(body.with, "with", "You can't message yourself");
      const viewer = await getCurrentUser();
      const other = await findParty(body.with);

      const { conversation, created } =
        await getRepository().messages.openDirect(viewer, other);

      if (created)
        res.setHeader("Location", conversationLocation(conversation));
      res
        .status(created ? 201 : 200)
        .json({ conversation } satisfies ConversationResponse);
    },
  },
  { feature: "messages" }
);
