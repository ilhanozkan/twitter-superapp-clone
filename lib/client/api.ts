import {
  ApiErrorResponse,
  MeResponse,
  RepliesResponse,
  ReplyResponse,
  TrendsResponse,
  TweetPageResponse,
  TweetResponse,
} from "../../types/Api";
import { ReactionKind } from "../../types/Tweet";

/** A non-2xx API response, carrying the server's error code and message. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiRequestError(
      0,
      "network_error",
      "Check your connection and try again."
    );
  }

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as ApiErrorResponse | null)?.error;
    throw new ApiRequestError(
      response.status,
      error?.code ?? "unknown_error",
      error?.message ?? "Something went wrong. Try again.",
      error?.requestId
    );
  }
  return body as T;
}

const json = (body: unknown) => JSON.stringify(body);
const tweetPath = (id: string) => `/api/tweets/${encodeURIComponent(id)}`;

export const api = {
  listTweets(query: Record<string, string>) {
    return request<TweetPageResponse>(
      `/api/tweets?${new URLSearchParams(query)}`
    );
  },

  createTweet(body: { text: string; image?: string | null }) {
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
