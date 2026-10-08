import type { NextApiRequest, NextApiResponse } from "next";

import { TweetResponse } from "../../types/Api";
import { ReactionKind } from "../../types/Tweet";
import { getCurrentUser } from "../auth";
import { getRepository } from "../db";
import { notFound } from "./errors";
import { createHandler } from "./handler";
import { routeId } from "./validation";

/**
 * PUT adds the reaction and DELETE removes it. Both are idempotent, so a
 * double click or a retried request never double-counts. Responds with the
 * updated tweet so clients can reconcile optimistic updates.
 */
export function createReactionHandler(kind: ReactionKind) {
  const setReaction =
    (active: boolean) =>
    async (req: NextApiRequest, res: NextApiResponse<TweetResponse>) => {
      const id = routeId(req);
      const actor = await getCurrentUser();

      await getRepository().setReaction(kind, id, actor, active);

      const tweet = await getRepository().getTweet(id, actor.username);
      if (!tweet) throw notFound("Tweet not found");
      res.status(200).json({ tweet });
    };

  return createHandler({ PUT: setReaction(true), DELETE: setReaction(false) });
}
