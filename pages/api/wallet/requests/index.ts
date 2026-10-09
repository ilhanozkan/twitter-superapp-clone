import { assertActorLimit } from "../../../../lib/api/actorLimits";
import { createHandler } from "../../../../lib/api/handler";
import {
  parseIdempotency,
  sendMoneyResult,
} from "../../../../lib/api/idempotency";
import { parseBody, parseQuery } from "../../../../lib/api/validation";
import {
  assertNotSelf,
  findParty,
  requestBody,
  requestLocation,
  requestsQuery,
} from "../../../../lib/api/wallet";
import { getCurrentUser, getCurrentUsername } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/db";
import {
  PaymentRequestResponse,
  PaymentRequestsResponse,
} from "../../../../types/Api";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default createHandler(
  {
    // GET /api/wallet/requests?role=incoming|outgoing&status= — newest first
    async GET(req, res) {
      const query = parseQuery(req, requestsQuery);
      const body: PaymentRequestsResponse = {
        items: await getRepository().wallet.listRequests(
          getCurrentUsername(),
          query
        ),
      };

      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json(body);
    },

    // POST /api/wallet/requests { from, amount, note? } with an
    // Idempotency-Key: asks `from` to pay the current user.
    async POST(req, res) {
      const body = parseBody(req, requestBody);
      assertNotSelf(
        body.from,
        "from",
        "You can't request credits from yourself"
      );
      const key = parseIdempotency(req, {
        scope: "wallet.request",
        prefix: "req",
        payload: { ...body, from: body.from.toLowerCase() },
      });
      const requester = await getCurrentUser();
      const payer = await findParty(body.from);
      assertActorLimit("money", requester.username);

      const { request, replayed } = await getRepository().wallet.createRequest({
        ...key,
        requester,
        payer,
        amount: body.amount,
        note: body.note,
        conversationId: null,
      });

      res.setHeader("Location", requestLocation(request));
      sendMoneyResult<PaymentRequestResponse>(res, 201, { request }, replayed);
    },
  },
  { feature: "wallet" }
);
