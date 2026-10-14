import {
  ChannelMembersResponse,
  ChannelResponse,
  ChannelsResponse,
  MessagePageResponse,
  MessageResponse,
} from "../../types/Message";
import { MessagePageQuery } from "./messagesApi";
import { request } from "./request";

// The channels endpoints (docs/api/channels.md). Messages page and send
// like a conversation's; a send takes the Idempotency-Key the caller keeps
// for that message, so a retry never posts twice.

const json = (body: unknown) => JSON.stringify(body);
const path = (handle: string) => `/api/channels/${encodeURIComponent(handle)}`;

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

export interface NewChannelBody {
  handle: string;
  name: string;
  description?: string | null;
}

export const channelsApi = {
  /** Discover (`member` false) or the current user's channels. */
  listChannels({ q, member }: { q?: string; member?: boolean } = {}) {
    return request<ChannelsResponse>(
      `/api/channels${query({ q, member: member ? "true" : undefined })}`
    );
  },

  createChannel(body: NewChannelBody) {
    return request<ChannelResponse>("/api/channels", {
      method: "POST",
      body: json(body),
    });
  },

  getChannel(handle: string) {
    return request<ChannelResponse>(path(handle));
  },

  join(handle: string) {
    return request<ChannelResponse>(`${path(handle)}/membership`, {
      method: "PUT",
    });
  },

  leave(handle: string) {
    return request<ChannelResponse>(`${path(handle)}/membership`, {
      method: "DELETE",
    });
  },

  listMembers(handle: string) {
    return request<ChannelMembersResponse>(`${path(handle)}/members`);
  },

  /** The owner makes a member a moderator, or a moderator a member. */
  setRole(handle: string, username: string, role: "moderator" | "member") {
    return request<ChannelResponse>(
      `${path(handle)}/members/${encodeURIComponent(username)}/role`,
      { method: "PUT", body: json({ role }) }
    );
  },

  listMessages(handle: string, page: MessagePageQuery = {}) {
    return request<MessagePageResponse>(
      `${path(handle)}/messages${query({ ...page })}`
    );
  },

  sendMessage(
    handle: string,
    body: { text: string; tweetId?: string | null },
    idempotencyKey: string
  ) {
    return request<MessageResponse>(`${path(handle)}/messages`, {
      method: "POST",
      body: json(body),
      idempotencyKey,
    });
  },

  /** Its author deletes it, or an owner or moderator removes it. */
  removeMessage(handle: string, messageId: string) {
    return request<void>(
      `${path(handle)}/messages/${encodeURIComponent(messageId)}`,
      { method: "DELETE" }
    );
  },

  markRead(handle: string) {
    return request<void>(`${path(handle)}/read`, { method: "PUT" });
  },
};
