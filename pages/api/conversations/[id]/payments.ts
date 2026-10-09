import { assertActorLimit } from "../../../../lib/api/actorLimits";
import { createHandler } from "../../../../lib/api/handler";
import {
  parseIdempotency,
  sendMoneyResult,
} from "../../../../lib/api/idempotency";
import { chatMoneyBody, conversationKey } from "../../../../lib/api/messages";
import { parseBody } from "../../../../lib/api/validation";
import { transferLocation } from "../../../../lib/api/wallet";
import { getCurrentUser } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/db";
import { ChatPaymentResponse } from "../../../../types/Message";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default createHandler(
  {
    // POST /api/conversations/:id/payments { amount, note? } with an
    // Idempotency-Key: pays the other member, and posts the payment as a
    // message in the same write. Direct conversations only.
    async POST(req, res) {
      const id = conversationKey(req);
      const body = parseBody(req, chatMoneyBody);
      const key = parseIdempotency(req, {
        scope: "messages.payment",
        prefix: "tx",
        payload: { ...body, conversationId: id },
      });
      const from = await getCurrentUser();
      assertActorLimit("money", from.username);

      const { message, transfer, wallet, replayed } =
        await getRepository().messages.sendPayment({
          ...key,
          conversationId: id,
          from,
          amount: body.amount,
          note: body.note,
        });

      res.setHeader("Location", transferLocation(transfer));
      sendMoneyResult<ChatPaymentResponse>(
        res,
        201,
        { message, transfer, wallet },
        replayed
      );
    },
  },
  { feature: "messages" }
);
