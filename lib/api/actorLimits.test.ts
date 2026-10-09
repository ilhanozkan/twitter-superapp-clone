import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stubDefaultEnv } from "../../test/api";
import { ACTOR_LIMITS, assertActorLimit } from "./actorLimits";
import { ApiError } from "./errors";

const globals = globalThis as { __superappActorLimiters?: unknown };

/** The error `assertActorLimit` threw, or null when it allowed the request. */
function attempt(
  bucket: Parameters<typeof assertActorLimit>[0],
  actor: string
) {
  try {
    assertActorLimit(bucket, actor);
    return null;
  } catch (error) {
    return error as ApiError;
  }
}

beforeEach(() => {
  stubDefaultEnv();
  delete globals.__superappActorLimiters;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  delete globals.__superappActorLimiters;
});

describe("assertActorLimit", () => {
  it("has the documented budgets", () => {
    expect(ACTOR_LIMITS).toEqual({
      money: { limit: 12, windowMs: 60_000 },
      messages: { limit: 30, windowMs: 60_000 },
      stories: { limit: 10, windowMs: 3_600_000 },
      channels: { limit: 5, windowMs: 3_600_000 },
      demoOrders: { limit: 5, windowMs: 3_600_000 },
    });
  });

  it("allows a bucket's budget, then answers 429 with Retry-After", () => {
    for (let i = 0; i < 12; i++)
      expect(attempt("money", "sarahcodes")).toBeNull();

    const error = attempt("money", "sarahcodes");
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, code: "rate_limited" });
    expect(error?.headers?.["Retry-After"]).toBe("60");

    vi.setSystemTime(new Date("2026-10-09T12:01:00.001Z"));
    expect(attempt("money", "sarahcodes")).toBeNull();
  });

  it("keeps one budget per actor (any case) and per bucket", () => {
    for (let i = 0; i < 5; i++)
      expect(attempt("channels", "SarahCodes")).toBeNull();
    expect(attempt("channels", "sarahcodes")?.status).toBe(429);

    expect(attempt("channels", "devmarco")).toBeNull();
    expect(attempt("stories", "sarahcodes")).toBeNull();
  });

  it("is turned off with WRITE_RATE_LIMIT=0", () => {
    vi.stubEnv("WRITE_RATE_LIMIT", "0");
    for (let i = 0; i < 20; i++)
      expect(attempt("demoOrders", "illlhanozkan")).toBeNull();
  });
});
