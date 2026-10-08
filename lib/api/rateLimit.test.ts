import { describe, expect, it } from "vitest";

import { createRateLimiter } from "./rateLimit";

describe("createRateLimiter", () => {
  it("allows `limit` requests per sliding window", () => {
    let time = 0;
    const check = createRateLimiter({
      limit: 2,
      windowMs: 1000,
      now: () => time,
    });

    expect(check("a").allowed).toBe(true);
    time = 400;
    expect(check("a").allowed).toBe(true);
    expect(check("a")).toEqual({ allowed: false, retryAfter: 1 });

    time = 1001; // the first request left the window
    expect(check("a").allowed).toBe(true);
    expect(check("b").allowed).toBe(true);
  });

  it("never tracks more than maxKeys clients, forgetting the least recent", () => {
    let time = 0;
    const check = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      now: () => time,
      maxKeys: 3,
    });

    for (const key of ["a", "b", "c"]) check(key);
    time = 10; // all still inside the window, so nothing can be pruned
    expect(check("d").allowed).toBe(true); // evicts "a", the oldest
    expect(check("a").allowed).toBe(true); // forgotten, so allowed again
    expect(check("c").allowed).toBe(false); // still tracked
  });

  it("stays bounded in memory", () => {
    let time = 0;
    const check = createRateLimiter({
      limit: 1,
      windowMs: 10,
      now: () => time,
      maxKeys: 3,
    });

    for (const key of ["a", "b", "c"]) check(key);
    time = 100; // all expired: adding a fourth key prunes them
    expect(check("d").allowed).toBe(true);
    expect(check("a").allowed).toBe(true);
  });
});
