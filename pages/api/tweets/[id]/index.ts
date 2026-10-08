import { forbidden, notFound } from "../../../../lib/api/errors";
import { createHandler } from "../../../../lib/api/handler";
import { routeId } from "../../../../lib/api/validation";
import { getCurrentUsername } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/db";

export default createHandler({
  async GET(req, res) {
    const tweet = await getRepository().getTweet(
      routeId(req),
      getCurrentUsername()
    );
    if (!tweet) throw notFound("Tweet not found");

    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json({ tweet });
  },

  // Only the author may delete a tweet; replies and reactions go with it.
  async DELETE(req, res) {
    const id = routeId(req);
    const viewer = getCurrentUsername();

    const tweet = await getRepository().getTweet(id);
    if (!tweet) throw notFound("Tweet not found");
    if (tweet.author.username.toLowerCase() !== viewer.toLowerCase()) {
      throw forbidden("You can only delete your own tweets");
    }

    await getRepository().deleteTweet(id);
    res.status(204).end();
  },
});
