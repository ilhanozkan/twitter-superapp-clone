import type { GetServerSidePropsContext } from "next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MemoryState } from "../../lib/db/memory";
import { IChannel, IMessage } from "../../types/Message";
import { call, freshApi, json, MockRequest, MockResponse } from "../api";

// /api/channels/** and the channel pages on a fresh superapp-world memory
// store. Assertions stick to the channels the lane seeds (#superapp_builders,
// which the demo user moderates, and #ankara_eats, which they haven't
// joined) and to channels the tests create.

const ROUTES = {
  channels: "pages/api/channels/index",
  channel: "pages/api/channels/[handle]/index",
  membership: "pages/api/channels/[handle]/membership",
  members: "pages/api/channels/[handle]/members/index",
  role: "pages/api/channels/[handle]/members/[username]/role",
  messages: "pages/api/channels/[handle]/messages/index",
  message: "pages/api/channels/[handle]/messages/[messageId]",
  read: "pages/api/channels/[handle]/read",
  conversationMessages: "pages/api/conversations/[id]/messages",
  payments: "pages/api/conversations/[id]/payments",
  requests: "pages/api/conversations/[id]/requests",
  me: "pages/api/me",
} as const;

type Handler = Parameters<typeof call>[0];
let api: Record<keyof typeof ROUTES, Handler>;

const BUILDERS = "superapp_builders";
const EATS = "ankara_eats";
/** #superapp_builders's conversation, which /api/conversations/** serves too. */
const BUILDERS_ID = "channel-superapp_builders";

let keyCount = 0;
const newKey = () => `channel-key-${String(++keyCount).padStart(6, "0")}`;

const state = () =>
  (globalThis as { __superappMemoryState?: MemoryState })
    .__superappMemoryState!;

const actAs = (username: string) => vi.stubEnv("DEMO_USERNAME", username);

const getChannel = (handle: string) => call(api.channel, { query: { handle } });
const join = (handle: string) =>
  call(api.membership, { method: "PUT", query: { handle } });
const leave = (handle: string) =>
  call(api.membership, { method: "DELETE", query: { handle } });
const create = (body: unknown) =>
  call(api.channels, { method: "POST", ...json(body) });
const post = (
  handle: string,
  body: unknown,
  key = newKey(),
  headers: Record<string, string> = {}
) =>
  call(api.messages, {
    method: "POST",
    query: { handle },
    ...json(body, { "idempotency-key": key, ...headers }),
  });
const page = (handle: string, query: Record<string, string> = {}) =>
  call(api.messages, { query: { handle, ...query } });
/** A keyed send through /api/conversations/:id/messages. */
const conversationSend = (
  id: string,
  body: unknown,
  key = newKey()
): MockRequest => ({
  method: "POST",
  query: { id },
  ...json(body, { "idempotency-key": key }),
});
const remove = (handle: string, messageId: string) =>
  call(api.message, { method: "DELETE", query: { handle, messageId } });
const setRole = (handle: string, username: string, role: unknown) =>
  call(api.role, {
    method: "PUT",
    query: { handle, username },
    ...json({ role }),
  });

function expectError(
  res: MockResponse,
  status: number,
  code: string,
  label?: string
) {
  expect(res.statusCode, label).toBe(status);
  expect(res.body.error.code, label).toBe(code);
  expect(res.headers["cache-control"], label).toBe("no-store");
}

function expectInvalid(res: MockResponse, path: string, label?: string) {
  expectError(res, 400, "validation_error", label);
  expect(
    res.body.error.details.map((detail: { path: string }) => detail.path),
    label
  ).toContain(path);
}

beforeEach(async () => {
  const { loadRoute } = await freshApi({ world: "superapp" });
  api = Object.fromEntries(
    await Promise.all(
      Object.entries(ROUTES).map(async ([name, path]) => [
        name,
        await loadRoute(path),
      ])
    )
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/channels", () => {
  it("lists Discover and your channels, with your role", async () => {
    const res = await call(api.channels);
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    const items: IChannel[] = res.body.items;
    expect(items.find((c) => c.handle === EATS)).toMatchObject({
      id: "channel-ankara_eats",
      name: "Ankara eats",
      memberCount: 4,
      viewer: { role: null, unread: 0 },
    });

    const mine = await call(api.channels, { query: { member: "true" } });
    expect(mine.body.items.map((c: IChannel) => c.handle)).toEqual([BUILDERS]);
    expect(mine.body.items[0].viewer).toEqual({
      role: "moderator",
      unread: 1,
    });

    const search = await call(api.channels, { query: { q: "eats" } });
    expect(search.body.items.map((c: IChannel) => c.handle)).toEqual([EATS]);
    expect((await call(api.me)).body.features.channels).toBe(true);
  });

  it("validates the query", async () => {
    expectInvalid(
      await call(api.channels, { query: { member: "yes" } }),
      "member"
    );
    expectInvalid(
      await call(api.channels, { query: { q: "x".repeat(101) } }),
      "q"
    );
    expectInvalid(await call(api.channels, { query: { q: ["a", "b"] } }), "q");
  });
});

describe("POST /api/channels", () => {
  it("creates a channel the current user owns (201 + Location)", async () => {
    const res = await create({
      handle: "night_shift",
      name: "  Night shift  ",
      description: " ",
      // Bodies never name the owner.
      owner: { username: "devmarco" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.headers.location).toBe("/api/channels/night_shift");
    expect(res.body.channel).toMatchObject({
      id: "channel-night_shift",
      handle: "night_shift",
      name: "Night shift",
      description: null,
      owner: { username: "illlhanozkan" },
      memberCount: 1,
      viewer: { role: "owner", unread: 0 },
    });
    expect((await getChannel("night_shift")).statusCode).toBe(200);
  });

  it("validates the handle, name and description", async () => {
    for (const [body, path] of [
      [{ name: "Room" }, "handle"],
      [{ handle: "ab", name: "Room" }, "handle"],
      [{ handle: "Night_Shift", name: "Room" }, "handle"],
      [{ handle: "night-shift", name: "Room" }, "handle"],
      [{ handle: "x".repeat(31), name: "Room" }, "handle"],
      [{ handle: "night_shift" }, "name"],
      [{ handle: "night_shift", name: "   " }, "name"],
      [{ handle: "night_shift", name: "n".repeat(51) }, "name"],
      [
        { handle: "night_shift", name: "Room", description: "d".repeat(161) },
        "description",
      ],
      [{ handle: "night_shift", name: "Room", description: 42 }, "description"],
    ] as const) {
      expectInvalid(await create(body), path, JSON.stringify(body));
    }
    // Lengths are in code points, like Tweets: 50 emoji are fine.
    expect(
      (await create({ handle: "emoji_room", name: "🍕".repeat(50) })).statusCode
    ).toBe(201);
    expect(state().messages.conversations.has("channel-night_shift")).toBe(
      false
    );
  });

  it("answers 409 for a taken handle and 422 past 3 channels", async () => {
    expectError(
      await create({ handle: BUILDERS, name: "Mine now" }),
      409,
      "conflict"
    );
    for (const handle of ["room_one", "room_two", "room_three"]) {
      expect((await create({ handle, name: handle })).statusCode).toBe(201);
    }
    const res = await create({ handle: "room_four", name: "Four" });
    expectError(res, 422, "limit_exceeded");
    expect(res.body.error.message).toBe("You can create up to 3 channels");
  });

  it("limits creating to 5 an hour per user (429 with Retry-After)", async () => {
    vi.stubEnv("WRITE_RATE_LIMIT", "100");
    const users = ["sarahcodes", "devmarco"];
    for (let i = 0; i < 5; i++) {
      actAs(users[i % 2]);
      // Taken handles still use the budget: it counts attempts.
      await create({ handle: BUILDERS, name: "Again" });
      actAs("illlhanozkan");
      const res = await create({ handle: BUILDERS, name: "Again" });
      expect(res.statusCode, `attempt ${i + 1}`).toBe(409);
    }
    const limited = await create({ handle: "late_room", name: "Late" });
    expectError(limited, 429, "rate_limited");
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
  });
});

describe("GET /api/channels/:handle", () => {
  it("reads a channel publicly, in any casing", async () => {
    const res = await getChannel("Ankara_Eats");
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.body.channel).toMatchObject({
      handle: EATS,
      viewer: { role: null },
    });
  });

  it("answers 404 for unknown channels and bad handles", async () => {
    for (const handle of ["no_such_room", "x", "private.channel-a", "a.b.c"]) {
      expectError(await getChannel(handle), 404, "not_found", handle);
    }
  });
});

describe("membership", () => {
  it("joins and leaves idempotently (200 each time)", async () => {
    const joined = await join(EATS);
    expect(joined.statusCode).toBe(200);
    expect(joined.body.channel).toMatchObject({
      memberCount: 5,
      viewer: { role: "member", unread: 0 },
    });
    expect((await join(EATS)).body.channel.memberCount).toBe(5);

    const left = await leave(EATS);
    expect(left.statusCode).toBe(200);
    expect(left.body.channel).toMatchObject({
      memberCount: 4,
      viewer: { role: null },
    });
    expect((await leave(EATS)).statusCode).toBe(200);
  });

  it("answers 409 when the owner leaves, and 404 for unknown channels", async () => {
    actAs("superapp");
    const res = await leave(BUILDERS);
    expectError(res, 409, "invalid_state");
    expect(res.body.error.message).toBe("The owner can't leave their channel");
    expectError(await join("no_such_room"), 404, "not_found");
  });
});

describe("members and roles", () => {
  it("lists the owner, moderators and members", async () => {
    const res = await call(api.members, { query: { handle: BUILDERS } });
    expect(res.statusCode).toBe(200);
    expect(
      res.body.items.map(
        ({ user, role }: { user: { username: string }; role: string }) =>
          `${role}:${user.username}`
      )
    ).toEqual([
      "owner:superapp",
      "moderator:illlhanozkan",
      "member:ayse_design",
      "member:devmarco",
      "member:sarahcodes",
    ]);
    expectError(
      await call(api.members, { query: { handle: "no_such_room" } }),
      404,
      "not_found"
    );
  });

  it("lets only the owner change roles (403 for anyone else)", async () => {
    // A moderator can't.
    const res = await setRole(BUILDERS, "sarahcodes", "moderator");
    expectError(res, 403, "forbidden");
    expect(res.body.error.message).toBe(
      "Only the channel's owner can change roles"
    );

    actAs("superapp");
    const promoted = await setRole(BUILDERS, "SarahCodes", "moderator");
    expect(promoted.statusCode).toBe(200);
    expect(promoted.body.channel.viewer.role).toBe("owner");
    actAs("sarahcodes");
    expect((await getChannel(BUILDERS)).body.channel.viewer.role).toBe(
      "moderator"
    );

    actAs("superapp");
    expectError(
      await setRole(BUILDERS, "superapp", "member"),
      403,
      "forbidden"
    );
    expectError(
      await setRole(BUILDERS, "nightowl_dev", "moderator"),
      404,
      "not_found"
    );
    expectInvalid(await setRole(BUILDERS, "sarahcodes", "owner"), "role");
    expectError(
      await setRole(BUILDERS, "not a user", "member"),
      404,
      "not_found"
    );
  });
});

describe("channel messages", () => {
  it("reads publicly, and posts for members only (403 before joining)", async () => {
    const read = await page(EATS);
    expect(read.statusCode).toBe(200);
    expect(read.body.items.map((m: IMessage) => m.id)).toEqual([
      "seed-msg-ae-01",
      "seed-msg-ae-02",
      "seed-msg-ae-03",
      "seed-msg-ae-04",
    ]);

    const refused = await post(EATS, { text: "Hello" });
    expectError(refused, 403, "forbidden");
    expect(refused.body.error.message).toBe(
      "Join this channel to send messages"
    );

    await join(EATS);
    const key = newKey();
    const sent = await post(
      EATS,
      { text: "Hello", storyId: "seed-story01" },
      key
    );
    expect(sent.statusCode).toBe(201);
    expect(sent.body.message).toMatchObject({
      conversationId: "channel-ankara_eats",
      author: { username: "illlhanozkan" },
      // Story replies belong in direct messages: dropped here.
      body: { type: "text", text: "Hello", story: null },
    });

    const again = await post(EATS, { text: "Hello" }, key);
    expect(again.statusCode).toBe(201);
    expect(again.headers["idempotent-replayed"]).toBe("true");
    expect(again.body.message.id).toBe(sent.body.message.id);
    expectError(
      await post(EATS, { text: "Something else" }, key),
      422,
      "idempotency_key_reused"
    );
    expect((await page(EATS)).body.items.at(-1).id).toBe(sent.body.message.id);
  });

  it("drops storyId through /api/conversations/channel-<handle>/messages too, as the same send", async () => {
    const key = newKey();
    const sent = await call(
      api.conversationMessages,
      conversationSend(
        BUILDERS_ID,
        { text: "Via the conversation route", storyId: "seed-story01" },
        key
      )
    );
    expect(sent.statusCode).toBe(201);
    expect(sent.body.message).toMatchObject({
      conversationId: BUILDERS_ID,
      body: { type: "text", text: "Via the conversation route", story: null },
    });

    // The channel route's send with that key is the same operation.
    const again = await post(
      BUILDERS,
      { text: "Via the conversation route" },
      key
    );
    expect(again.statusCode).toBe(201);
    expect(again.headers["idempotent-replayed"]).toBe("true");
    expect(again.body.message.id).toBe(sent.body.message.id);
  });

  it("validates sends and pages, and 404s unknown channels", async () => {
    await join(EATS);
    expectInvalid(await post(EATS, { text: "" }), "text");
    expectInvalid(await post(EATS, { text: "x".repeat(1_001) }), "text");
    expectInvalid(await post(EATS, { tweetId: "bad.id" }), "tweetId");
    const keyless = await call(api.messages, {
      method: "POST",
      query: { handle: EATS },
      ...json({ text: "Hi" }),
    });
    expectInvalid(keyless, "Idempotency-Key");
    expectInvalid(
      await page(EATS, { before: "nope", after: "nope" }),
      "before"
    );
    expectError(await page("no_such_room"), 404, "not_found");
    expectError(await post("no_such_room", { text: "Hi" }), 404, "not_found");
  });

  it("refuses payments and requests in channels (409 invalid_state)", async () => {
    for (const [name, handler] of [
      ["payments", api.payments],
      ["requests", api.requests],
    ] as const) {
      const res = await call(handler, {
        method: "POST",
        query: { id: "channel-superapp_builders" },
        ...json({ amount: 100 }, { "idempotency-key": newKey() }),
      });
      expectError(res, 409, "invalid_state", name);
      expect(res.body.error.message, name).toBe(
        "Payments are only available in direct messages"
      );
    }
  });

  it("marks a channel read for its members (204)", async () => {
    const res = await call(api.read, {
      method: "PUT",
      query: { handle: BUILDERS },
    });
    expect(res.statusCode).toBe(204);
    expect((await getChannel(BUILDERS)).body.channel.viewer.unread).toBe(0);
    // A no-op for non-members; unknown channels are 404.
    expect(
      (await call(api.read, { method: "PUT", query: { handle: EATS } }))
        .statusCode
    ).toBe(204);
    expectError(
      await call(api.read, {
        method: "PUT",
        query: { handle: "no_such_room" },
      }),
      404,
      "not_found"
    );
  });
});

describe("DELETE /api/channels/:handle/messages/:messageId", () => {
  const bodyOf = async (handle: string, id: string) =>
    (await page(handle)).body.items.find((m: IMessage) => m.id === id)?.body;

  it("lets a moderator remove anyone's message, idempotently (204)", async () => {
    const res = await remove(BUILDERS, "seed-msg-sab-04");
    expect(res.statusCode).toBe(204);
    expect(await bodyOf(BUILDERS, "seed-msg-sab-04")).toEqual({
      type: "removed",
      by: "moderator",
    });
    expect((await remove(BUILDERS, "seed-msg-sab-04")).statusCode).toBe(204);
  });

  it("lets authors delete their own, and nobody else (403)", async () => {
    actAs("sarahcodes");
    const res = await remove(BUILDERS, "seed-msg-sab-05");
    expectError(res, 403, "forbidden");
    expect(await bodyOf(BUILDERS, "seed-msg-sab-05")).toMatchObject({
      type: "text",
    });

    expect((await remove(BUILDERS, "seed-msg-sab-02")).statusCode).toBe(204);
    expect(await bodyOf(BUILDERS, "seed-msg-sab-02")).toEqual({
      type: "removed",
      by: "author",
    });
  });

  it("answers 404 for messages of other channels, direct messages and unknown ids", async () => {
    for (const [handle, id] of [
      [BUILDERS, "seed-msg-ae-02"],
      [BUILDERS, "seed-msg-marco-01"],
      [BUILDERS, "no-such-message"],
      [BUILDERS, "private.seed-msg-sab-04"],
      ["no_such_room", "seed-msg-sab-04"],
    ]) {
      expectError(await remove(handle, id), 404, "not_found", id);
    }
  });
});

const writes = (): [string, Handler, MockRequest][] => [
  [
    "POST channels",
    api.channels,
    { method: "POST", ...json({ handle: "x_room", name: "X" }) },
  ],
  [
    "PUT membership",
    api.membership,
    { method: "PUT", query: { handle: EATS } },
  ],
  [
    "DELETE membership",
    api.membership,
    { method: "DELETE", query: { handle: BUILDERS } },
  ],
  [
    "PUT role",
    api.role,
    {
      method: "PUT",
      query: { handle: BUILDERS, username: "sarahcodes" },
      ...json({ role: "moderator" }),
    },
  ],
  [
    "POST messages",
    api.messages,
    {
      method: "POST",
      query: { handle: BUILDERS },
      ...json({ text: "Hi" }, { "idempotency-key": newKey() }),
    },
  ],
  [
    "DELETE message",
    api.message,
    {
      method: "DELETE",
      query: { handle: BUILDERS, messageId: "seed-msg-sab-04" },
    },
  ],
  ["PUT read", api.read, { method: "PUT", query: { handle: BUILDERS } }],
];

describe("write protections", () => {
  it("rejects every write with 403 read_only in READ_ONLY mode", async () => {
    vi.stubEnv("READ_ONLY", "true");
    for (const [name, handler, request] of writes()) {
      expectError(await call(handler, request), 403, "read_only", name);
    }
    expect((await getChannel(BUILDERS)).body.channel.viewer.unread).toBe(1);
    expect((await page(BUILDERS)).statusCode).toBe(200);
  });

  it("rejects cross-origin writes", async () => {
    for (const [name, handler, request] of writes()) {
      const res = await call(handler, {
        ...request,
        headers: { ...request.headers, origin: "https://evil.example" },
      });
      expectError(res, 403, "forbidden", name);
    }
  });

  it("parses bodies only on routes that take one", async () => {
    const config = async (path: string) =>
      (await import("../../" + path)).config;
    for (const path of [ROUTES.channels, ROUTES.role, ROUTES.messages]) {
      expect(await config(path), path).toEqual({
        api: { bodyParser: { sizeLimit: "16kb" } },
      });
    }
    for (const path of [
      ROUTES.channel,
      ROUTES.membership,
      ROUTES.members,
      ROUTES.message,
      ROUTES.read,
    ]) {
      expect(await config(path), path).toEqual({ api: { bodyParser: false } });
    }
  });

  it("answers 405 for methods a route doesn't have", async () => {
    for (const [name, handler, method] of [
      ["channels", api.channels, "DELETE"],
      ["channel", api.channel, "POST"],
      ["membership", api.membership, "POST"],
      ["members", api.members, "PUT"],
      ["role", api.role, "GET"],
      ["message", api.message, "GET"],
      ["read", api.read, "POST"],
    ] as const) {
      const res = await call(handler, {
        method,
        query: { handle: BUILDERS, username: "sarahcodes", messageId: "x" },
      });
      expectError(res, 405, "method_not_allowed", name);
    }
  });
});

describe("feature gating", () => {
  it("turns every channel route into a 404 with DISABLED_FEATURES=channels", async () => {
    vi.stubEnv("DISABLED_FEATURES", "channels");
    const reads: [string, Handler, MockRequest][] = [
      ["GET channels", api.channels, {}],
      ["GET channel", api.channel, { query: { handle: BUILDERS } }],
      ["GET members", api.members, { query: { handle: BUILDERS } }],
      ["GET messages", api.messages, { query: { handle: BUILDERS } }],
    ];
    // The messages engine serves channel ids too: they follow this switch.
    const viaConversations: [string, Handler, MockRequest][] = [
      [
        "GET conversation messages",
        api.conversationMessages,
        { query: { id: BUILDERS_ID } },
      ],
      [
        "POST conversation messages",
        api.conversationMessages,
        conversationSend(BUILDERS_ID, {
          text: "Posted while channels are off",
        }),
      ],
    ];
    const stored = () =>
      [...state().messages.messages.values()].filter(
        (message) => message.conversationId === BUILDERS_ID
      ).length;
    const before = stored();
    for (const [name, handler, request] of [
      ...reads,
      ...writes(),
      ...viaConversations,
    ]) {
      const res = await call(handler, request);
      expectError(res, 404, "not_found", name);
      expect(res.body.error.message, name).toBe("This feature is turned off");
    }
    expect(stored()).toBe(before);
    expect((await call(api.me)).body.features).toMatchObject({
      channels: false,
      messages: true,
    });
    // Direct messages stay on.
    const direct = await call(api.conversationMessages, {
      query: { id: "dm-illlhanozkan-sarahcodes" },
    });
    expect(direct.statusCode).toBe(200);
  });

  it("answers 503 through /api/conversations while channels are unconfigured", async () => {
    const { getRepository } = await import("../../lib/db");
    const repo = getRepository();
    const statusOf = repo.featureStatus.bind(repo);
    vi.spyOn(repo, "featureStatus").mockImplementation((id) =>
      id === "channels" ? "unconfigured" : statusOf(id)
    );
    for (const [name, request] of [
      ["GET", { query: { id: BUILDERS_ID } }],
      ["POST", conversationSend(BUILDERS_ID, { text: "Hi" })],
    ] as [string, MockRequest][]) {
      const res = await call(api.conversationMessages, request);
      expectError(res, 503, "service_unavailable", name);
      expect(res.body.error.message, name).toBe(
        "Channels needs SANITY_API_TOKEN on this deployment"
      );
    }
  });

  it("answers 503 while the data source can't serve channels", async () => {
    vi.stubEnv("DATA_SOURCE", "sanity");
    vi.stubEnv("SANITY_PROJECT_ID", "testproject");
    vi.stubEnv("SANITY_API_TOKEN", "");
    for (const [name, handler, request] of [
      ["GET channels", api.channels, {}],
      ...writes(),
    ] as [string, Handler, MockRequest][]) {
      const res = await call(handler, request);
      expectError(res, 503, "service_unavailable", name);
      expect(res.body.error.message, name).toBe(
        "Channels needs SANITY_API_TOKEN on this deployment"
      );
    }
  });
});

describe("channel pages", () => {
  async function serverSide(
    page: "index" | "[handle]",
    { query = {}, params = {} }: { query?: object; params?: object } = {}
  ) {
    const res = { statusCode: 200 };
    const ctx = { query, params, res } as unknown as GetServerSidePropsContext;
    const { getServerSideProps } = await import(
      page === "index"
        ? "../../pages/channels/index"
        : "../../pages/channels/[handle]"
    );
    return (await getServerSideProps(ctx)) as Record<string, any>;
  }

  it("serves both lists on /channels", async () => {
    const result = await serverSide("index");
    const { mine, discover } = result.props.initialState.channels;
    expect(mine).toMatchObject({ loaded: true, error: null });
    expect(mine.items.map((c: IChannel) => c.handle)).toEqual([BUILDERS]);
    expect(discover.items.map((c: IChannel) => c.handle)).toEqual(
      expect.arrayContaining([BUILDERS, EATS])
    );
  });

  it("serves a channel to anyone without marking it read", async () => {
    const result = await serverSide("[handle]", { params: { handle: EATS } });
    expect(result.props.handle).toBe(EATS);
    const { threads, mine } = result.props.initialState.channels;
    expect(threads[EATS].channel.viewer.role).toBeNull();
    expect(threads[EATS].messages).toHaveLength(4);
    expect(mine.items.map((c: IChannel) => c.handle)).toEqual([BUILDERS]);

    await serverSide("[handle]", { params: { handle: BUILDERS } });
    expect((await getChannel(BUILDERS)).body.channel.viewer.unread).toBe(1);
  });

  it("redirects other casings and 404s unknown or bad handles", async () => {
    expect(
      (await serverSide("[handle]", { params: { handle: "Ankara_Eats" } }))
        .redirect
    ).toEqual({ destination: "/channels/ankara_eats", permanent: false });
    for (const handle of ["no_such_room", "x", "drafts.x"]) {
      expect(
        await serverSide("[handle]", { params: { handle } }),
        handle
      ).toEqual({ notFound: true });
    }
  });

  it("is a 404 while Channels is off", async () => {
    vi.stubEnv("DISABLED_FEATURES", "channels");
    expect(await serverSide("index")).toEqual({ notFound: true });
    expect(await serverSide("[handle]", { params: { handle: EATS } })).toEqual({
      notFound: true,
    });
  });
});
