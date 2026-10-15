import type { NextApiRequest, NextApiResponse } from "next";
import { vi } from "vitest";

import type { SeedWorld } from "../lib/db/seed";

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
 * Pins every setting the API reads to its default, so variables exported in
 * the developer's shell (READ_ONLY, DEMO_USERNAME, ...) cannot change results.
 * Tests that need another value stub it explicitly.
 */
export function stubDefaultEnv() {
  vi.stubEnv("DATA_SOURCE", "memory");
  for (const name of [
    "READ_ONLY",
    "DEMO_USERNAME",
    "WRITE_RATE_LIMIT",
    "TRUST_PROXY",
    "VERCEL",
    "SUPERAPP_TIME_SCALE",
    "DISABLED_FEATURES",
  ]) {
    vi.stubEnv(name, "");
  }
}

/**
 * Resets module state (the repository, the rate limiters) and seeds a fresh
 * in-memory store with `world`. Routes loaded afterwards with `loadRoute`
 * share that store. The core world is the data the existing route tests
 * assert; SuperApp route tests use "superapp".
 */
export async function freshApi({ world = "core" }: { world?: SeedWorld } = {}) {
  vi.resetModules();
  stubDefaultEnv();
  const globals = globalThis as {
    __superappMemoryState?: unknown;
    __superappWriteLimiters?: unknown;
    __superappActorLimiters?: unknown;
  };
  delete globals.__superappWriteLimiters;
  delete globals.__superappActorLimiters;

  const { createMemoryState } = await import("../lib/db/memory");
  const { createSeedData } = await import("../lib/db/seed");
  globals.__superappMemoryState = createMemoryState(
    createSeedData(new Date(), { world })
  );

  return {
    /** A route module's handler, e.g. `loadRoute("pages/api/wallet/index")`. */
    loadRoute: async (path: string) => {
      const specifier = "../" + path;
      return (await import(specifier)).default as Handler;
    },
  };
}

/** The core API routes against a fresh core-world store. */
export async function freshRoutes() {
  const { loadRoute } = await freshApi();
  return {
    tweets: await loadRoute("pages/api/tweets/index"),
    tweet: await loadRoute("pages/api/tweets/[id]/index"),
    replies: await loadRoute("pages/api/tweets/[id]/replies"),
    like: await loadRoute("pages/api/tweets/[id]/like"),
    retweet: await loadRoute("pages/api/tweets/[id]/retweet"),
    bookmark: await loadRoute("pages/api/tweets/[id]/bookmark"),
    user: await loadRoute("pages/api/users/[username]"),
    me: await loadRoute("pages/api/me"),
    trends: await loadRoute("pages/api/trends"),
    notifications: await loadRoute("pages/api/notifications"),
    health: await loadRoute("pages/api/health"),
  };
}
