import type { NextApiRequest, NextApiResponse } from "next";
import { vi } from "vitest";

type Handler = (req: NextApiRequest, res: NextApiResponse) => unknown;

export interface MockRequest {
  method?: string;
  url?: string;
  query?: Record<string, string | string[]>;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  ended: boolean;
}

/** Calls a Next.js API handler with a minimal request/response pair. */
export async function call(
  handler: Handler,
  request: MockRequest = {}
): Promise<MockResponse> {
  const headers = Object.fromEntries(
    Object.entries(request.headers ?? {}).map(([key, value]) => [
      key.toLowerCase(),
      value,
    ])
  );
  const req = {
    method: request.method ?? "GET",
    url: request.url ?? "/api/test",
    query: request.query ?? {},
    headers: { host: "localhost:3000", ...headers },
    body: request.body,
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as NextApiRequest;

  const state: MockResponse & { headersSent: boolean } = {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended: false,
    headersSent: false,
  };
  const res = {
    get headersSent() {
      return state.headersSent;
    },
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    setHeader(name: string, value: string) {
      state.headers[name.toLowerCase()] = String(value);
      return res;
    },
    getHeader(name: string) {
      return state.headers[name.toLowerCase()];
    },
    json(body: unknown) {
      state.body = body;
      state.ended = state.headersSent = true;
      return res;
    },
    send(body: unknown) {
      state.body = body;
      state.ended = state.headersSent = true;
      return res;
    },
    end() {
      state.ended = state.headersSent = true;
      return res;
    },
  } as unknown as NextApiResponse;

  await handler(req, res);
  return state;
}

export const json = (body: unknown, headers: Record<string, string> = {}) => ({
  body,
  headers: { "content-type": "application/json", ...headers },
});

/**
 * Imports API routes against a fresh in-memory dataset: module state (the
 * repository, the rate limiter) and the seeded store are reset.
 */
export async function freshRoutes() {
  vi.resetModules();
  vi.stubEnv("DATA_SOURCE", "memory");
  delete (globalThis as { __superappMemoryState?: unknown })
    .__superappMemoryState;

  const load = async (path: string) => (await import(path)).default as Handler;
  return {
    tweets: await load("../pages/api/tweets/index"),
    tweet: await load("../pages/api/tweets/[id]/index"),
    replies: await load("../pages/api/tweets/[id]/replies"),
    like: await load("../pages/api/tweets/[id]/like"),
    retweet: await load("../pages/api/tweets/[id]/retweet"),
    bookmark: await load("../pages/api/tweets/[id]/bookmark"),
    user: await load("../pages/api/users/[username]"),
    me: await load("../pages/api/me"),
    trends: await load("../pages/api/trends"),
    notifications: await load("../pages/api/notifications"),
    health: await load("../pages/api/health"),
  };
}
