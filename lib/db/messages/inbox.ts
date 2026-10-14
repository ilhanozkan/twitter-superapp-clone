import { IChannel, IConversation } from "../../../types/Message";
import { ChannelsRepository, MessagesRepository } from "./types";

/**
 * The inbox for a messages page. A failed read is logged and returns null
 * (the list shows an error with Retry), so the conversation beside it, or
 * the draft, still renders.
 */
export async function readInbox(
  messages: MessagesRepository,
  viewer: string
): Promise<IConversation[] | null> {
  try {
    return await messages.listConversations(viewer);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Reading the inbox for a messages page failed",
        error: error instanceof Error ? error.message : String(error),
      })
    );
    return null;
  }
}

/**
 * Channels for a channels page (`member`: only theirs). Like `readInbox`, a
 * failed read is logged and returns null, so the list shows an error with
 * Retry while the rest of the page renders.
 */
export async function readChannels(
  channels: ChannelsRepository,
  query: { member?: string },
  viewer: string
): Promise<IChannel[] | null> {
  try {
    return await channels.listChannels(query, viewer);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Reading channels for a channels page failed",
        error: error instanceof Error ? error.message : String(error),
      })
    );
    return null;
  }
}
