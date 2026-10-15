import { assertActorLimit } from "../../../../lib/api/actorLimits";
import { forbidden, notFound } from "../../../../lib/api/errors";
import { createHandler } from "../../../../lib/api/handler";
import {
  parseIdempotency,
  sendMoneyResult,
} from "../../../../lib/api/idempotency";
import { parseBody, routeId } from "../../../../lib/api/validation";
import { tipBody, transferLocation } from "../../../../lib/api/wallet";
import { getCurrentUser } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/db";
import { TipResponse } from "../../../../types/Api";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default createHandler(
  {
    // POST /api/tweets/:id/tip { amount, note? } with an Idempotency-Key.
    // Responds with the Tweet too, so its tip count and `tipped` update.
    async POST(req, res) {
      const id = routeId(req);
      const body = parseBody(req, tipBody);
      const key = parseIdempotency(req, {
        scope: "tweets.tip",
        prefix: "tx",
        payload: { ...body, tweetId: id },
      });
      const repo = getRepository();
      const from = await getCurrentUser();

      const tweet = await repo.getTweet(id, from.username);
      if (!tweet) throw notFound("Tweet not found");
      if (tweet.author.username.toLowerCase() === from.username.toLowerCase()) {
        throw forbidden("You can't tip your own Tweet");
      }
      assertActorLimit("money", from.username);

      const { transfer, wallet, replayed } = await repo.wallet.send({
        ...key,
        kind: "tip",
        from,
        to: tweet.author,
        amount: body.amount,
        note: body.note,
        context: { type: "tweet", id: tweet.id },
      });
      const tipped = (await repo.getTweet(id, from.username)) ?? tweet;

      res.setHeader("Location", transferLocation(transfer));
      sendMoneyResult<TipResponse>(
        res,
        201,
        { transfer, wallet, tweet: tipped },
        replayed
      );
    },
  },
  { feature: "wallet" }
);
