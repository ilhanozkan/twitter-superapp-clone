import type { NextApiRequest, NextApiResponse } from "next";

import { createHandler } from "../../../../lib/api/handler";
import { channelHandle } from "../../../../lib/api/messages";
import { getCurrentUser } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/db";
import { ChannelResponse } from "../../../../types/Message";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

/** Joins (`member`) or leaves the channel; repeating either changes nothing. */
const membership =
  (member: boolean) => async (req: NextApiRequest, res: NextApiResponse) => {
    const handle = channelHandle(req);
    const user = await getCurrentUser();
    const { channel } = await getRepository().channels.setMembership(
      handle,
      user,
      member
    );
    res.status(200).json({ channel } satisfies ChannelResponse);
  };

export default createHandler(
  {
    // PUT /api/channels/:handle/membership — join.
    PUT: membership(true),
    // DELETE /api/channels/:handle/membership — leave (409 for the owner).
    DELETE: membership(false),
  },
  { feature: "channels" }
);
