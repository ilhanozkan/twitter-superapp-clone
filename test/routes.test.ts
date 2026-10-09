import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { call, freshRoutes, json } from "./api";

let api: Awaited<ReturnType<typeof freshRoutes>>;

beforeEach(async () => {
  api = await freshRoutes();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/tweets", () => {
  it("returns the first page with the current user's reactions", async () => {
    const res = await call(api.tweets, { query: { limit: "5" } });

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.body.items).toHaveLength(5);
    expect(res.body.items[0].id).toBe("seed-t01");
    expect(res.body.items[0].viewer.retweeted).toBe(true);
    expect(typeof res.body.nextCursor).toBe("string");

    const next = await call(api.tweets, {
      query: { limit: "5", cursor: res.body.nextCursor },
    });
    expect(next.body.items[0].id).toBe("seed-t06");
  });

  it("filters by author, search, likes and the current user's bookmarks", async () => {
    const byAuthor = await call(api.tweets, {
      query: { author: "sarahcodes" },
    });
    expect(byAuthor.body.items.map((t: { id: string }) => t.id)).toEqual([
      "seed-t02",
      "seed-t09",
      "seed-t17",
    ]);

    const search = await call(api.tweets, { query: { q: "dolomites" } });
    expect(search.body.items.map((t: { id: string }) => t.id)).toEqual([
      "seed-t03",
    ]);

    const liked = await call(api.tweets, {
      query: { likedBy: "illlhanozkan" },
    });
    expect(liked.body.items).toHaveLength(4);

    const bookmarks = await call(api.tweets, { query: { bookmarked: "true" } });
    expect(bookmarks.body.items.map((t: { id: string }) => t.id)).toEqual([
      "seed-t04",
      "seed-t11",
      "seed-t17",
    ]);
  });

  it("rejects invalid query parameters", async () => {
    const cases: Record<string, string | string[]>[] = [
      { limit: "0" },
      { limit: "51" },
      { limit: "ten" },
      { cursor: "not-a-cursor" },
      { author: "not a username" },
      { author: ["a", "b"] },
      { q: "x".repeat(101) },
    ];
    for (const query of cases) {
      const res = await call(api.tweets, { query });
      expect(res.statusCode, JSON.stringify(query)).toBe(400);
      expect(res.body.error.code).toBe("validation_error");
    }
  });
});

describe("POST /api/tweets", () => {
  it("creates a tweet as the current user, ignoring identity in the body", async () => {
    const res = await call(api.tweets, {
      method: "POST",
      ...json({
        text: "  Hello\r\nworld\u0007  ",
        image: "/media/coffee.svg",
        username: "mallory",
        fullname: "Mallory",
      }),
    });

    expect(res.statusCode).toBe(201);
    expect(res.headers.location).toBe(`/api/tweets/${res.body.tweet.id}`);
    expect(res.body.tweet).toMatchObject({
      text: "Hello\nworld",
      image: "/media/coffee.svg",
      author: {
        username: "illlhanozkan",
        fullname: "Ilhan Ozkan",
        image: "/avatars/illlhanozkan.svg",
      },
      stats: { replies: 0, retweets: 0, likes: 0 },
    });

    const list = await call(api.tweets, { query: { limit: "1" } });
    expect(list.body.items[0].id).toBe(res.body.tweet.id);
  });

  it("counts length in characters, not UTF-16 units", async () => {
    const ok = await call(api.tweets, {
      method: "POST",
      ...json({ text: "😀".repeat(280) }),
    });
    expect(ok.statusCode).toBe(201);

    const tooLong = await call(api.tweets, {
      method: "POST",
      ...json({ text: "😀".repeat(281) }),
    });
    expect(tooLong.statusCode).toBe(400);
    expect(tooLong.body.error.details).toEqual([
      { path: "text", message: "Text must be at most 280 characters" },
    ]);
  });

  it("validates the body", async () => {
    const cases: [unknown, string][] = [
      [{}, "text"],
      [{ text: "   " }, "text"],
      [{ text: 42 }, "text"],
      [{ text: { evil: 1 } }, "text"],
      [{ text: "hi", image: "javascript:alert(1)" }, "image"],
      [{ text: "hi", image: "http://insecure.example/a.png" }, "image"],
      [{ text: "hi", image: "//evil.example/a.png" }, "image"],
    ];
    for (const [body, path] of cases) {
      const res = await call(api.tweets, { method: "POST", ...json(body) });
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
      expect(res.body.error.details[0].path).toBe(path);
    }
  });

  it("requires a JSON object body", async () => {
    const plain = await call(api.tweets, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: '{"text":"hi"}',
    });
    expect(plain.statusCode).toBe(415);
    expect(plain.body.error.code).toBe("unsupported_media_type");

    for (const body of [["hi"], null, "hi"]) {
      const res = await call(api.tweets, { method: "POST", ...json(body) });
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe("bad_request");
    }
  });

  it("rejects cross-origin writes", async () => {
    const res = await call(api.tweets, {
      method: "POST",
      ...json({ text: "hi" }, { origin: "https://evil.example" }),
    });
    expect(res.statusCode).toBe(403);

    const sameOrigin = await call(api.tweets, {
      method: "POST",
      ...json({ text: "hi" }, { origin: "http://localhost:3000" }),
    });
    expect(sameOrigin.statusCode).toBe(201);
  });
});

describe("/api/tweets/:id", () => {
  it("returns a tweet or 404", async () => {
    expect(
      (await call(api.tweet, { query: { id: "seed-t03" } })).body.tweet.id
    ).toBe("seed-t03");
    // With the current user's reactions.
    expect(
      (await call(api.tweet, { query: { id: "seed-t01" } })).body.tweet.viewer
    ).toMatchObject({ retweeted: true });
    expect(
      (await call(api.tweet, { query: { id: "missing" } })).statusCode
    ).toBe(404);
    expect(
      (await call(api.tweet, { query: { id: "seed-t99" } })).statusCode
    ).toBe(404);
    expect(
      (await call(api.tweet, { query: { id: "../etc" } })).statusCode
    ).toBe(404);
  });

  it("lets only the author delete a tweet", async () => {
    const others = await call(api.tweet, {
      method: "DELETE",
      query: { id: "seed-t02" },
    });
    expect(others.statusCode).toBe(403);

    const mine = await call(api.tweet, {
      method: "DELETE",
      query: { id: "seed-t05" },
    });
    expect(mine.statusCode).toBe(204);
    expect(
      (await call(api.tweet, { query: { id: "seed-t05" } })).statusCode
    ).toBe(404);
    expect(
      (await call(api.replies, { query: { id: "seed-t05" } })).statusCode
    ).toBe(404);

    expect(
      (await call(api.tweet, { method: "DELETE", query: { id: "seed-t05" } }))
        .statusCode
    ).toBe(404);
  });
});

describe("/api/tweets/:id/replies", () => {
  it("lists and creates replies", async () => {
    const list = await call(api.replies, { query: { id: "seed-t12" } });
    expect(list.body.items.map((r: { id: string }) => r.id)).toEqual([
      "seed-r05",
      "seed-r06",
      "seed-r07",
    ]);

    const created = await call(api.replies, {
      method: "POST",
      query: { id: "seed-t12" },
      ...json({ text: "🍔 too" }),
    });
    expect(created.statusCode).toBe(201);
    expect(created.body.reply).toMatchObject({
      tweetId: "seed-t12",
      text: "🍔 too",
      author: { username: "illlhanozkan" },
    });

    const tweet = await call(api.tweet, { query: { id: "seed-t12" } });
    expect(tweet.body.tweet.stats.replies).toBe(4);
  });

  it("404s for missing tweets", async () => {
    expect(
      (await call(api.replies, { query: { id: "missing" } })).statusCode
    ).toBe(404);
    const res = await call(api.replies, {
      method: "POST",
      query: { id: "missing" },
      ...json({ text: "hi" }),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("reactions", () => {
  it("PUT and DELETE are idempotent and return the updated tweet", async () => {
    const first = await call(api.like, {
      method: "PUT",
      query: { id: "seed-t20" },
    });
    const second = await call(api.like, {
      method: "PUT",
      query: { id: "seed-t20" },
    });
    expect(first.statusCode).toBe(200);
    expect(second.body.tweet.stats.likes).toBe(1);
    expect(second.body.tweet.viewer.liked).toBe(true);

    const removed = await call(api.like, {
      method: "DELETE",
      query: { id: "seed-t20" },
    });
    expect(removed.body.tweet.stats.likes).toBe(0);
    expect(removed.body.tweet.viewer.liked).toBe(false);
  });

  it("supports retweets and bookmarks", async () => {
    expect(
      (await call(api.retweet, { method: "PUT", query: { id: "seed-t20" } }))
        .body.tweet.viewer.retweeted
    ).toBe(true);
    expect(
      (await call(api.bookmark, { method: "PUT", query: { id: "seed-t20" } }))
        .body.tweet.viewer.bookmarked
    ).toBe(true);
  });

  it("only accepts PUT and DELETE", async () => {
    const res = await call(api.like, {
      method: "POST",
      query: { id: "seed-t20" },
    });
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe("PUT, DELETE, OPTIONS");
  });

  it("404s for missing tweets", async () => {
    expect(
      (await call(api.bookmark, { method: "PUT", query: { id: "missing" } }))
        .statusCode
    ).toBe(404);
  });
});

describe("read-only mode", () => {
  it("rejects every write route", async () => {
    vi.stubEnv("READ_ONLY", "true");
    const id = { id: "seed-t05" };
    const writes: [
      string,
      Parameters<typeof call>[0],
      Parameters<typeof call>[1],
    ][] = [
      ["POST /tweets", api.tweets, { method: "POST", ...json({ text: "hi" }) }],
      ["DELETE /tweets/:id", api.tweet, { method: "DELETE", query: id }],
      [
        "POST /replies",
        api.replies,
        { method: "POST", query: id, ...json({ text: "hi" }) },
      ],
      ["PUT /like", api.like, { method: "PUT", query: id }],
      ["DELETE /like", api.like, { method: "DELETE", query: id }],
      ["PUT /retweet", api.retweet, { method: "PUT", query: id }],
      ["DELETE /retweet", api.retweet, { method: "DELETE", query: id }],
      ["PUT /bookmark", api.bookmark, { method: "PUT", query: id }],
      ["DELETE /bookmark", api.bookmark, { method: "DELETE", query: id }],
    ];
    for (const [name, handler, request] of writes) {
      const res = await call(handler, request);
      expect(res.statusCode, name).toBe(403);
      expect(res.body.error.code, name).toBe("read_only");
    }
    expect((await call(api.tweet, { query: id })).statusCode).toBe(200);
  });
});

describe("users, me, trends, notifications, health", () => {
  it("returns profiles", async () => {
    const res = await call(api.user, { query: { username: "LenaFrames" } });
    expect(res.body.user).toMatchObject({
      username: "lenaframes",
      tweetCount: 3,
    });
    expect(
      (await call(api.user, { query: { username: "ghost" } })).statusCode
    ).toBe(404);
    expect(
      (await call(api.user, { query: { username: "not valid!" } })).statusCode
    ).toBe(404);
  });

  it("returns the current user, configurable with DEMO_USERNAME", async () => {
    const me = await call(api.me);
    expect(me.body.user).toMatchObject({
      username: "illlhanozkan",
      fullname: "Ilhan Ozkan",
    });
    expect(me.body.readOnly).toBe(false);
    vi.stubEnv("READ_ONLY", "true");
    expect((await call(api.me)).body.readOnly).toBe(true);
    vi.stubEnv("READ_ONLY", "");

    vi.stubEnv("DEMO_USERNAME", "sarahcodes");
    expect((await call(api.me)).body.user).toMatchObject({
      username: "sarahcodes",
      verified: true,
    });
  });

  it("reports the SuperApp features and the businesses the user runs", async () => {
    const me = await call(api.me);

    expect(Object.keys(me.body.features).sort()).toEqual([
      "channels",
      "messages",
      "orders",
      "rides",
      "shop",
      "stories",
      "wallet",
    ]);
    expect(
      Object.values(me.body.features).every(
        (value) => typeof value === "boolean"
      )
    ).toBe(true);
    // The core world has no business profiles.
    expect(me.body.managedBusinesses).toEqual([]);
  });

  it("returns cacheable trends", async () => {
    const res = await call(api.trends, { query: { limit: "2" } });
    expect(res.body.items).toEqual([
      { tag: "#SuperApp", tweetCount: 4 },
      { tag: "#Photography", tweetCount: 3 },
    ]);
    expect(res.headers["cache-control"]).toContain("s-maxage=60");
  });

  it("returns the current user's notifications", async () => {
    const res = await call(api.notifications, { query: { limit: "5" } });
    expect(res.body.items).toHaveLength(5);
    expect(
      res.body.items.every((n: { tweet: { id: string } }) =>
        ["seed-t05", "seed-t12", "seed-t19"].includes(n.tweet.id)
      )
    ).toBe(true);
  });

  it("reports health and the data source", async () => {
    expect((await call(api.health)).body).toEqual({
      status: "ok",
      dataSource: "memory",
    });
  });

  it("answers 503, not 500, when the data source is misconfigured", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("DATA_SOURCE", "sanity");
    vi.stubEnv("SANITY_PROJECT_ID", "");
    vi.stubEnv("NEXT_PUBLIC_SANITY_PROJECT_ID", "");
    vi.resetModules();
    const health = (await import("../pages/api/health")).default;

    const res = await call(health);
    expect(res.statusCode).toBe(503);
    expect(res.body.error.code).toBe("service_unavailable");
    expect(res.headers["cache-control"]).toBe("no-store");
    vi.restoreAllMocks();
  });

  it("answers unknown endpoints with a JSON 404", async () => {
    const unknown = (await import("../pages/api/[...path]")).default;

    for (const method of ["GET", "POST", "DELETE"]) {
      const res = await call(unknown, { method, url: "/api/getTweets" });
      expect(res.statusCode, method).toBe(404);
      expect(res.body.error.code).toBe("not_found");
      expect(res.headers["x-request-id"]).toBeTruthy();
    }
  });

  it("does not parse bodies on routes that take none", async () => {
    const withoutBody = {
      health: import("../pages/api/health"),
      me: import("../pages/api/me"),
      notifications: import("../pages/api/notifications"),
      trends: import("../pages/api/trends"),
      tweet: import("../pages/api/tweets/[id]/index"),
      like: import("../pages/api/tweets/[id]/like"),
      retweet: import("../pages/api/tweets/[id]/retweet"),
      bookmark: import("../pages/api/tweets/[id]/bookmark"),
      user: import("../pages/api/users/[username]"),
      unknown: import("../pages/api/[...path]"),
    };
    for (const [name, route] of Object.entries(withoutBody)) {
      expect((await route).config, name).toEqual({
        api: { bodyParser: false },
      });
    }

    const withBody = {
      tweets: import("../pages/api/tweets/index"),
      replies: import("../pages/api/tweets/[id]/replies"),
    };
    for (const [name, route] of Object.entries(withBody)) {
      expect((await route).config, name).toEqual({
        api: { bodyParser: { sizeLimit: "16kb" } },
      });
    }
  });
});
