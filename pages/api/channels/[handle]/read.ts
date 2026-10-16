import { createHandler } from "../../../../lib/api/handler";
import { channelHandle, findChannel } from "../../../../lib/api/messages";
import { getCurrentUsername } from "../../../../lib/auth";
import { getRepository } from "../../../../lib/db";
import { channelConversationId } from "../../../../lib/superapp/messages";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

export default createHandler(
  {
    // PUT /api/channels/:handle/read — marks everything so far as read for
    // a member (a no-op for anyone else). The marker never moves back.
    async PUT(req, res) {
      const handle = channelHandle(req);
      const viewer = getCurrentUsername();
      await findChannel(handle, viewer);

      await getRepository().messages.markRead(
        channelConversationId(handle),
        viewer
      );
      res.status(204).end();
    },
  },
  { feature: "channels" }
);
