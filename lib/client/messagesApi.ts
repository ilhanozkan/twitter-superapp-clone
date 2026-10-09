import { Cents } from "../../types/Money";
import {
  ChatPaymentResponse,
  ChatRequestResponse,
  ConversationResponse,
  ConversationsResponse,
  MessagePageResponse,
  MessageResponse,
} from "../../types/Message";
import { request } from "./request";

// The messages endpoints (docs/api/messages.md). Sends take the
// Idempotency-Key the caller keeps for that message, payment or request
// (useIdempotencyKey), so a retry can never post or pay twice.

const json = (body: unknown) => JSON.stringify(body);
const id = (value: string) => encodeURIComponent(value);

function query(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      search.set(name, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export interface MessagePageQuery {
  /** Older than this cursor (a page's `olderCursor`). */
  before?: string | null;
  /** Newer than this cursor (a page's `newestCursor`): what a poll asks for. */
  after?: string | null;
  limit?: number;
}

export interface NewChatMessage {
  text: string;
  tweetId?: string | null;
  storyId?: string | null;
}

export interface ChatMoneyBody {
  amount: Cents;
  note?: string | null;
}

export const messagesApi = {
  listConversations() {
    return request<ConversationsResponse>("/api/conversations");
  },

  /** Opens (or finds) the direct conversation with `username`. */
  openConversation(username: string) {
    return request<ConversationResponse>("/api/conversations", {
      method: "POST",
      body: json({ with: username }),
    });
  },

  getConversation(conversationId: string) {
    return request<ConversationResponse>(
      `/api/conversations/${id(conversationId)}`
    );
  },

  listMessages(conversationId: string, page: MessagePageQuery = {}) {
    return request<MessagePageResponse>(
      `/api/conversations/${id(conversationId)}/messages${query({ ...page })}`
    );
  },

  sendMessage(
    conversationId: string,
    body: NewChatMessage,
    idempotencyKey: string
  ) {
    return request<MessageResponse>(
      `/api/conversations/${id(conversationId)}/messages`,
      { method: "POST", body: json(body), idempotencyKey }
    );
  },

  /** Pays the other member; the payment shows in the conversation. */
  sendPayment(
    conversationId: string,
    body: ChatMoneyBody,
    idempotencyKey: string
  ) {
    return request<ChatPaymentResponse>(
      `/api/conversations/${id(conversationId)}/payments`,
      { method: "POST", body: json(body), idempotencyKey }
    );
  },

  /** Asks the other member to pay; they answer through walletApi. */
  sendRequest(
    conversationId: string,
    body: ChatMoneyBody,
    idempotencyKey: string
  ) {
    return request<ChatRequestResponse>(
      `/api/conversations/${id(conversationId)}/requests`,
      { method: "POST", body: json(body), idempotencyKey }
    );
  },

  markRead(conversationId: string) {
    return request<void>(`/api/conversations/${id(conversationId)}/read`, {
      method: "PUT",
    });
  },
};
