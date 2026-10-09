import { assertActorLimit } from "../../../../lib/api/actorLimits";
import { createHandler } from "../../../../lib/api/handler";
import {
  parseIdempotency,
  sendMoneyResult,
} from "../../../../lib/api/idempotency";
import { chatMoneyBody, conversationKey } from "../../../../lib/api/messages";
import { parseBody } from "../../../../lib/api/validation";
import { requestLocation } from "../../../../lib/api/wallet";
import { getCurrentUser } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/db";
import { ChatRequestResponse } from "../../../../types/Message";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default createHandler(
  {
    // POST /api/conversations/:id/requests { amount, note? } with an
    // Idempotency-Key: asks the other member to pay the current user, and
    // posts the request as a message in the same write. It is paid,
    // declined or cancelled through /api/wallet/requests/:id.
    async POST(req, res) {
      const id = conversationKey(req);
      const body = parseBody(req, chatMoneyBody);
      const key = parseIdempotency(req, {
        scope: "messages.request",
        prefix: "req",
        payload: { ...body, conversationId: id },
      });
      const from = await getCurrentUser();
      assertActorLimit("money", from.username);

      const { message, request, replayed } =
        await getRepository().messages.sendRequest({
          ...key,
          conversationId: id,
          from,
          amount: body.amount,
          note: body.note,
        });

      res.setHeader("Location", requestLocation(request));
      sendMoneyResult<ChatRequestResponse>(
        res,
        201,
        { message, request },
        replayed
      );
    },
  },
  { feature: "messages" }
);
