import { ChannelsRepository } from "../messages/types";
import { unbuiltChannels } from "../stubs";
import { MemoryDeps } from "./deps";

// Stub: the channels lane replaces this file; its state lives in
// state.messages.

export const createMemoryChannels: (
  deps: MemoryDeps
) => ChannelsRepository = () => unbuiltChannels(true);
