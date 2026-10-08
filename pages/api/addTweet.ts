import type { NextApiRequest, NextApiResponse } from "next";

import { getRepository } from "../../lib/db";
import { TweetBody } from "../../types/Tweet";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<string>
) {
  let data: Partial<TweetBody>;
  try {
    data = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json("Invalid JSON");
  }

  if (
    typeof data?.tweet !== "string" ||
    !data.tweet.trim() ||
    typeof data.username !== "string" ||
    typeof data.fullname !== "string"
  ) {
    return res.status(400).json("tweet, username and fullname are required");
  }

  await getRepository().createTweet({
    text: data.tweet,
    image: data.tweetImage || null,
    author: {
      username: data.username,
      fullname: data.fullname,
      image: data.userImage || null,
    },
  });

  res.status(200).json("Ok");
}
