import type { NextApiRequest, NextApiResponse } from "next";
import { groq } from "next-sanity";

import { ITweet } from "../../types/Tweet";
import { sanityClient } from "../../sanity";

type Data = {
  tweet: ITweet[];
};

const feedQuery = groq`
  *[_type == "tweet" && !blockTweet] {
    _id,
    ...
  } | order(_createdAt desc)
`;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  const tweets: ITweet[] = await sanityClient.fetch(feedQuery);

  res.status(200).json({ tweets });
}
