import { checkAttachment } from "../../../lib/api/attachments";
import { createHandler } from "../../../lib/api/handler";
import {
  createTweetBody,
  listTweetsQuery,
  parseBody,
  parseQuery,
} from "../../../lib/api/validation";
import { getCurrentUser, getCurrentUsername } from "../../../lib/auth";
import { getRepository } from "../../../lib/db";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default createHandler({
  // GET /api/tweets?author=&q=&likedBy=&bookmarked=true&limit=&cursor=
  async GET(req, res) {
    const query = parseQuery(req, listTweetsQuery);
    const viewer = getCurrentUsername();

    const page = await getRepository().listTweets({
      viewer,
      author: query.author,
      search: query.q,
      likedBy: query.likedBy,
      // Bookmarks are private: only the current user's can be listed.
      bookmarkedBy: query.bookmarked === "true" ? viewer : undefined,
      limit: query.limit,
      cursor: query.cursor,
    });

    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json(page);
  },

  // POST /api/tweets { text, image?, attachment?: { type: "product", productId } }
  async POST(req, res) {
    const body = parseBody(req, createTweetBody);
    const repo = getRepository();
    const attachment = body.attachment
      ? await checkAttachment(repo, body.attachment)
      : null;
    const author = await getCurrentUser();

    const tweet = await repo.createTweet({
      text: body.text,
      image: body.image ?? null,
      author,
      attachment,
    });

    res.setHeader("Location", `/api/tweets/${encodeURIComponent(tweet.id)}`);
    res.status(201).json({ tweet });
  },
});
