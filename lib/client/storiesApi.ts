import {
  StoriesResponse,
  StoryContent,
  StoryResponse,
  StoryTrayResponse,
  StoryViewersResponse,
} from "../../types/Story";
import { request } from "./request";

// The stories endpoints (docs/api/stories.md). None of them moves credits,
// so none takes an Idempotency-Key: marking stories seen is idempotent by
// itself, and a retried post at worst shows the story twice. Replies are
// direct messages, sent through the messages API (§3.2).

const json = (body: unknown) => JSON.stringify(body);
const id = (value: string) => encodeURIComponent(value);

/** The part of a conversation a story reply needs (types/Message.ts has the rest). */
interface ConversationRef {
  conversation: { id: string };
}

/** What the composer sends: a text story, or an image with alt text and an optional caption. */
export type NewStoryContent =
  | Extract<StoryContent, { type: "text" }>
  | (Omit<Extract<StoryContent, { type: "image" }>, "caption"> & {
      caption?: string | null;
    });

export const storiesApi = {
  tray() {
    return request<StoryTrayResponse>("/api/stories/tray");
  },

  /** `author`'s visible stories, oldest first. */
  list(author: string) {
    return request<StoriesResponse>(
      `/api/stories?author=${encodeURIComponent(author)}`
    );
  },

  get(storyId: string) {
    return request<StoryResponse>(`/api/stories/${id(storyId)}`);
  },

  create(content: NewStoryContent) {
    return request<StoryResponse>("/api/stories", {
      method: "POST",
      body: json({ content }),
    });
  },

  remove(storyId: string) {
    return request<void>(`/api/stories/${id(storyId)}`, { method: "DELETE" });
  },

  /** At most 50 ids per call (SEEN_BATCH_MAX). */
  markSeen(ids: string[]) {
    return request<void>("/api/stories/views", {
      method: "POST",
      body: json({ ids }),
    });
  },

  /** Only the author's own stories; 404 for anyone else. */
  viewers(storyId: string) {
    return request<StoryViewersResponse>(`/api/stories/${id(storyId)}/viewers`);
  },

  /**
   * Replies to a story in a direct message to its author: opens (or finds)
   * the conversation, then sends the text with the story attached, keyed so
   * a retry can't send it twice. Resolves with the conversation's id.
   */
  async reply(
    author: string,
    storyId: string,
    text: string,
    idempotencyKey: string
  ): Promise<string> {
    const { conversation } = await request<ConversationRef>(
      "/api/conversations",
      { method: "POST", body: json({ with: author }) }
    );
    await request<unknown>(
      `/api/conversations/${id(conversation.id)}/messages`,
      { method: "POST", body: json({ text, storyId }), idempotencyKey }
    );
    return conversation.id;
  },
};
