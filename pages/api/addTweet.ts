import type { NextApiRequest, NextApiResponse } from "next";

import { textLength, TWEET_MAX_LENGTH } from "../../lib/constants";
import { getRepository } from "../../lib/db";
import { TweetBody } from "../../types/Tweet";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

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

  const optionalString = (value: unknown) =>
    value === undefined || value === null || typeof value === "string";

  if (
    typeof data?.tweet !== "string" ||
    !data.tweet.trim() ||
    textLength(data.tweet) > TWEET_MAX_LENGTH ||
    typeof data.username !== "string" ||
    typeof data.fullname !== "string" ||
    !optionalString(data.userImage) ||
    !optionalString(data.tweetImage)
  ) {
    return res
      .status(400)
      .json("tweet (1-280 characters), username and fullname are required");
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
