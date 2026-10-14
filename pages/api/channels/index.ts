import { assertActorLimit } from "../../../lib/api/actorLimits";
import { createHandler } from "../../../lib/api/handler";
import {
  channelLocation,
  channelsQuery,
  createChannelBody,
} from "../../../lib/api/messages";
import { parseBody, parseQuery } from "../../../lib/api/validation";
import { getCurrentUser, getCurrentUsername } from "../../../lib/auth";
import { getRepository } from "../../../lib/db";
import { ChannelResponse, ChannelsResponse } from "../../../types/Message";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default createHandler(
  {
    // GET /api/channels?q=&member=true — public channels (Discover: the
    // biggest first), or only yours (the most recently active first).
    async GET(req, res) {
      const { q, member } = parseQuery(req, channelsQuery);
      const viewer = getCurrentUsername();
      const body: ChannelsResponse = {
        items: await getRepository().channels.listChannels(
          { member: member === "true" ? viewer : undefined, search: q },
          viewer
        ),
      };

      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json(body);
    },

    // POST /api/channels { handle, name, description? } — the current user
    // creates a channel and owns it. A handle is taken once (409); each
    // person creates at most 3 (422). No key: the handle makes it unique.
    async POST(req, res) {
      const body = parseBody(req, createChannelBody);
      const owner = await getCurrentUser();
      assertActorLimit("channels", owner.username);

      const channel = await getRepository().channels.createChannel({
        owner,
        handle: body.handle,
        name: body.name,
        description: body.description,
      });

      res.setHeader("Location", channelLocation(channel));
      res.status(201).json({ channel } satisfies ChannelResponse);
    },
  },
  { feature: "channels" }
);
