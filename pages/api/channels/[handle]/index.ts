import { createHandler } from "../../../../lib/api/handler";
import { channelHandle, findChannel } from "../../../../lib/api/messages";
import { getCurrentUsername } from "../../../../lib/auth";
import { ChannelResponse } from "../../../../types/Message";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

export default createHandler(
  {
    // GET /api/channels/:handle — public: anyone can read a channel; `viewer`
    // says whether you are in it (your role) and what you haven't read.
    async GET(req, res) {
      const channel = await findChannel(
        channelHandle(req),
        getCurrentUsername()
      );

      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json({ channel } satisfies ChannelResponse);
    },
  },
  { feature: "channels" }
);
