import { createHandler } from "../../../../../lib/api/handler";
import { channelHandle } from "../../../../../lib/api/messages";
import { getRepository } from "../../../../../lib/db";
import { ChannelMembersResponse } from "../../../../../types/Message";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

export default createHandler(
  {
    // GET /api/channels/:handle/members — public, like the channel: the
    // owner, then moderators, then members, each by username.
    async GET(req, res) {
      const body: ChannelMembersResponse = {
        items: await getRepository().channels.listMembers(channelHandle(req)),
      };

      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json(body);
    },
  },
  { feature: "channels" }
);
