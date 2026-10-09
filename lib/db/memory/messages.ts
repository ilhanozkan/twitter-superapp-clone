import { MessagesRepository } from "../messages/types";
import { MessagesSeed } from "../seeds/messages";
import { unbuiltMessages } from "../stubs";
import { MemoryDeps } from "./deps";

// Stub: the messages lane replaces this file. Channels keep their state here
// too (lib/db/memory/channels.ts reads it).

export type MessagesMemoryState = Record<string, never>;

export const createMessagesMemoryState: (
  seed: MessagesSeed | null
) => MessagesMemoryState = () => ({});

export const createMemoryMessages: (
  deps: MemoryDeps
) => MessagesRepository = () => unbuiltMessages(true);
