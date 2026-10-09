import { ChannelsRepository } from "../messages/types";
import { unbuiltChannels } from "../stubs";
import { SanityDeps } from "./deps";

// Stub: the channels lane replaces this file. Conversations are private, so the
// feature needs a token to read them.

export function createSanityChannels(deps: SanityDeps): ChannelsRepository {
  return unbuiltChannels(deps.canReadPrivate);
}
