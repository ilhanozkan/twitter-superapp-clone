import { forbidden } from "../../../../../../lib/api/errors";
import { createHandler } from "../../../../../../lib/api/handler";
import {
  channelHandle,
  findChannel,
  roleBody,
} from "../../../../../../lib/api/messages";
import { parseBody, routeUsername } from "../../../../../../lib/api/validation";
import { getCurrentUsername } from "../../../../../../lib/auth";
import { getRepository } from "../../../../../../lib/db";
import { canChangeRoles } from "../../../../../../lib/superapp/policy/messages";
import { ChannelResponse } from "../../../../../../types/Message";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default createHandler(
  {
    // PUT /api/channels/:handle/members/:username/role { role } — the owner
    // makes a member a moderator, or a moderator a member again.
    async PUT(req, res) {
      const handle = channelHandle(req);
      const username = routeUsername(req);
      const { role } = parseBody(req, roleBody);

      const { viewer } = await findChannel(handle, getCurrentUsername());
      if (!canChangeRoles(viewer.role)) {
        throw forbidden("Only the channel's owner can change roles");
      }
      const channel = await getRepository().channels.setRole(
        handle,
        username,
        role
      );
      res.status(200).json({ channel } satisfies ChannelResponse);
    },
  },
  { feature: "channels" }
);
