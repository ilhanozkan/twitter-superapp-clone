import type { NextApiRequest, NextApiResponse } from "next";

import { MAX_PAGE_SIZE } from "../../lib/constants";
import { getRepository } from "../../lib/db";
import { ITweetsData } from "../../types/Tweet";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ITweetsData>
) {
  const { items } = await getRepository().listTweets({ limit: MAX_PAGE_SIZE });

  res.status(200).json({ tweets: items });
}
