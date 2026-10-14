import { IConversation } from "../../../types/Message";
import { MessagesRepository } from "./types";

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
