import {
  MeResponse,
  RepliesResponse,
  ReplyResponse,
  TrendsResponse,
  TweetPageResponse,
  TweetResponse,
} from "../../types/Api";
import { ReactionKind, TweetAttachmentInput } from "../../types/Tweet";
import { request } from "./request";

// Lanes add their own lib/client/<lane>Api.ts on top of request().
export { ApiRequestError, request } from "./request";
export type { RequestOptions, WithHeaders } from "./request";

const json = (body: unknown) => JSON.stringify(body);
const tweetPath = (id: string) => `/api/tweets/${encodeURIComponent(id)}`;

export interface NewTweetBody {
  text: string;
  image?: string | null;
  attachment?: TweetAttachmentInput;
}

export const api = {
  listTweets(query: Record<string, string>) {
    return request<TweetPageResponse>(
      `/api/tweets?${new URLSearchParams(query)}`
    );
  },

  createTweet(body: NewTweetBody) {
    return request<TweetResponse>("/api/tweets", {
      method: "POST",
      body: json(body),
    });
  },

  deleteTweet(id: string) {
    return request<void>(tweetPath(id), { method: "DELETE" });
  },

  setReaction(id: string, kind: ReactionKind, active: boolean) {
    return request<TweetResponse>(`${tweetPath(id)}/${kind}`, {
      method: active ? "PUT" : "DELETE",
    });
  },

  listReplies(id: string) {
    return request<RepliesResponse>(`${tweetPath(id)}/replies`);
  },

  createReply(id: string, text: string) {
    return request<ReplyResponse>(`${tweetPath(id)}/replies`, {
      method: "POST",
      body: json({ text }),
    });
  },

  me() {
    return request<MeResponse>("/api/me");
  },

  trends() {
    return request<TrendsResponse>("/api/trends");
  },
};

/**
 * The message to show for a failed request. Handles errors as thrown and as
 * serialized by Redux Toolkit (`unwrap()` rejects with a plain `{ message }`).
 */
export function errorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message
  ) {
    return error.message;
  }
  return "Something went wrong. Try again.";
}
