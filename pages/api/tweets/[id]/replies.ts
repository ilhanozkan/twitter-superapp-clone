import { notFound } from "../../../../lib/api/errors";
import { createHandler } from "../../../../lib/api/handler";
import {
  createReplyBody,
  parseBody,
  routeId,
} from "../../../../lib/api/validation";
import { getCurrentUser } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/db";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default createHandler({
  // Replies, oldest first.
  async GET(req, res) {
    const id = routeId(req);
    if (!(await getRepository().getTweet(id)))
      throw notFound("Tweet not found");

    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json({ items: await getRepository().listReplies(id) });
  },

  // POST { text }
  async POST(req, res) {
    const id = routeId(req);
    const body = parseBody(req, createReplyBody);
    const author = await getCurrentUser();

    const reply = await getRepository().createReply({
      tweetId: id,
      text: body.text,
      author,
    });
    res.status(201).json({ reply });
  },
});
