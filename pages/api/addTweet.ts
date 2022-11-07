import type { NextApiRequest, NextApiResponse } from "next";

import { TweetBody } from "../../types/Tweet";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<string>
) {
  const API_ENDPOINT = `https://${process.env.NEXT_PUBLIC_SANITY_PROJECT_ID}.api.sanity.io/v2021-06-07/data/mutate/${process.env.NEXT_PUBLIC_SANITY_DATASET}`;
  const data: TweetBody = JSON.parse(req.body);

  const mutations = {
    mutations: [
      {
        create: {
          _type: "tweet",
          blockTweet: false,
          fullname: data.fullname,
          username: data.username,
          tweet: data.tweet,
          userImage: data.userImage,
          tweetImage: data.tweetImage,
        },
      },
    ],
  };

  const result = await fetch(API_ENDPOINT, {
    method: "post",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${process.env.SANITY_API_TOKEN}`,
    },
    body: JSON.stringify(mutations),
  });

  const jsonData = await result.json();

  res.status(200).json("Ok");
}
