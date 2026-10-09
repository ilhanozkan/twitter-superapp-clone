import { MessagesRepository } from "../messages/types";
import { unbuiltMessages } from "../stubs";
import { SanityDeps } from "./deps";

// Stub: the messages lane replaces this file. Messages documents are private, so the
// feature needs a token to read them.

export function createSanityMessages(deps: SanityDeps): MessagesRepository {
  return unbuiltMessages(deps.canReadPrivate);
}
