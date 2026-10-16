import { forbidden, notFound } from "../../../../../lib/api/errors";
import { createHandler } from "../../../../../lib/api/handler";
import {
  channelHandle,
  channelMessageKey,
  findChannel,
} from "../../../../../lib/api/messages";
import { getCurrentUsername } from "../../../../../lib/auth";
import { getRepository } from "../../../../../lib/db";
import { removalBy } from "../../../../../lib/superapp/policy/messages";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

export default createHandler(
  {
    // DELETE /api/channels/:handle/messages/:messageId — its author deletes
    // it ("Message deleted"), or an owner or moderator removes it ("Message
    // removed by a moderator"). Deleting a removed message changes nothing.
    async DELETE(req, res) {
      const handle = channelHandle(req);
      const messageId = channelMessageKey(req);
      const actor = getCurrentUsername();
      const channels = getRepository().channels;

      const [{ viewer }, message] = await Promise.all([
        findChannel(handle, actor),
        channels.findMessage?.(handle, messageId) ?? null,
      ]);
      if (!message) throw notFound("Message not found");
      const by = removalBy(
        viewer.role,
        message.author.username.toLowerCase() === actor.toLowerCase()
      );
      if (!by) {
        throw forbidden("Only its author or a moderator can delete a message");
      }

      await channels.removeMessage(messageId, by);
      res.status(204).end();
    },
  },
  { feature: "channels" }
);
