import type { GetServerSidePropsContext } from "next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MemoryState } from "../../lib/db/memory";
import { IConversation, IMessage } from "../../types/Message";
import { call, freshApi, json, MockRequest, MockResponse } from "../api";

// /api/conversations/** on a fresh superapp-world memory store. Assertions
// stick to the messages lane's own seed (the demo user's conversations) and
// to conversations the tests open, never to whole-world totals.

const ROUTES = {
  conversations: "pages/api/conversations/index",
  conversation: "pages/api/conversations/[id]/index",
  messages: "pages/api/conversations/[id]/messages",
  payments: "pages/api/conversations/[id]/payments",
  requests: "pages/api/conversations/[id]/requests",
  read: "pages/api/conversations/[id]/read",
  wallet: "pages/api/wallet/index",
  pay: "pages/api/wallet/requests/[id]/pay",
  transfers: "pages/api/wallet/transfers/index",
  activity: "pages/api/activity",
  me: "pages/api/me",
} as const;

type Handler = Parameters<typeof call>[0];
let api: Record<keyof typeof ROUTES, Handler>;

const SARAH = "dm-illlhanozkan-sarahcodes";
const MARCO = "dm-devmarco-illlhanozkan";
const NIGHTOWL = "dm-illlhanozkan-nightowl_dev";

let keyCount = 0;
const newKey = () => `test-key-${String(++keyCount).padStart(6, "0")}`;

/** A keyed JSON POST to a conversation route. */
const keyed = (
  id: string,
  body: unknown,
  key = newKey(),
  headers: Record<string, string> = {}
): MockRequest => ({
  method: "POST",
  query: { id },
  ...json(body, { "idempotency-key": key, ...headers }),
});

const state = () =>
  (globalThis as { __superappMemoryState?: MemoryState })
    .__superappMemoryState!;

const actAs = (username: string) => vi.stubEnv("DEMO_USERNAME", username);

const open = (username: string) =>
  call(api.conversations, { method: "POST", ...json({ with: username }) });

const say = (id: string, text: string, key?: string) =>
  call(api.messages, keyed(id, { text }, key));

const page = (id: string, query: Record<string, string> = {}) =>
  call(api.messages, { query: { id, ...query } });

async function balance(): Promise<number> {
  return (await call(api.wallet)).body.wallet.balance;
}

/** The demo user's balance in the store, for when the wallet's routes are off. */
const storedBalance = () => state().wallet.balances.get("illlhanozkan") ?? 0;

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
  expect(res.body.error.details[0].path, label).toBe(path);
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

describe("GET /api/conversations", () => {
  it("lists the current user's conversations with unread counts", async () => {
    const res = await call(api.conversations);

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    const items: IConversation[] = res.body.items;
    const withSarah = items.find((c) => c.id === SARAH)!;
    expect(withSarah).toMatchObject({
      kind: "direct",
      other: { username: "sarahcodes", fullname: "Sarah Chen" },
      unread: 1,
      lastMessage: {
        body: { type: "request", request: { id: "seed-req01" } },
      },
    });
    expect(items.find((c) => c.id === MARCO)?.unread).toBe(0);

    // The Messages badge counts the same conversations.
    expect((await call(api.activity)).body.unreadConversations).toBe(1);
    expect((await call(api.me)).body.features.messages).toBe(true);
  });
});

describe("POST /api/conversations", () => {
  it("opens a conversation once (201), then finds it (200)", async () => {
    const created = await open("NightOwl_Dev");
    expect(created.statusCode).toBe(201);
    expect(created.headers.location).toBe(`/api/conversations/${NIGHTOWL}`);
    expect(created.body.conversation).toMatchObject({
      id: NIGHTOWL,
      other: { username: "nightowl_dev", fullname: "Priya Nair" },
      lastMessage: null,
      unread: 0,
    });

    const again = await open("nightowl_dev");
    expect(again.statusCode).toBe(200);
    expect(again.headers.location).toBeUndefined();
    expect(again.body.conversation.id).toBe(NIGHTOWL);
  });

  it("greets on behalf of a business", async () => {
    actAs("sarahcodes");
    const res = await open("kizilaykahve");
    expect(res.statusCode).toBe(201);
    expect(res.body.conversation.lastMessage).toMatchObject({
      id: "msg-greeting-dm-kizilaykahve-sarahcodes",
      author: { username: "kizilaykahve" },
      body: { type: "text" },
    });
  });

  it("refuses yourself (400), unknown people (404) and bad bodies (400)", async () => {
    expectInvalid(await open("IllLhanOzkan"), "with");
    expectError(await open("nobody_here"), 404, "not_found");
    for (const body of [{}, { with: "not valid!" }, { with: 42 }]) {
      expectInvalid(
        await call(api.conversations, { method: "POST", ...json(body) }),
        "with",
        JSON.stringify(body)
      );
    }
    expectError(
      await call(api.conversations, {
        method: "POST",
        body: "with=sarahcodes",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
      415,
      "unsupported_media_type"
    );
  });
});

describe("GET /api/conversations/:id", () => {
  it("shows a conversation to its members only (404 for everyone else)", async () => {
    const res = await call(api.conversation, { query: { id: SARAH } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.body.conversation).toMatchObject({ id: SARAH, unread: 1 });

    actAs("devmarco");
    expectError(
      await call(api.conversation, { query: { id: SARAH } }),
      404,
      "not_found"
    );
    // The longest key the API accepts can't name a conversation either.
    for (const id of [
      "dm-nobody-noone",
      "private.dm-a-b",
      "a/b",
      "",
      `dm-${"x".repeat(117)}`,
    ]) {
      expectError(
        await call(api.conversation, { query: { id } }),
        404,
        "not_found",
        id
      );
    }
  });
});

describe("GET /api/conversations/:id/messages", () => {
  it("pages messages oldest to newest, with cursors for older and newer", async () => {
    await open("nightowl_dev");
    for (let i = 0; i < 3; i++) {
      expect((await say(NIGHTOWL, `Message ${i}`)).statusCode).toBe(201);
    }

    const all: IMessage[] = (await page(NIGHTOWL)).body.items;
    expect(
      all.map((m) => m.body.type === "text" && m.body.text).sort()
    ).toEqual(["Message 0", "Message 1", "Message 2"]);

    const newest = await page(NIGHTOWL, { limit: "2" });
    expect(newest.statusCode).toBe(200);
    expect(newest.headers["cache-control"]).toBe("private, no-store");
    expect(newest.body.items).toEqual(all.slice(1));
    expect(
      Math.abs(Date.parse(newest.body.serverNow) - Date.now())
    ).toBeLessThan(5_000);

    const older = await page(NIGHTOWL, { before: newest.body.olderCursor });
    expect(older.body.items).toEqual(all.slice(0, 1));
    expect(older.body.olderCursor).toBeNull();

    const none = await page(NIGHTOWL, { after: newest.body.newestCursor });
    expect(none.body).toMatchObject({
      items: [],
      newestCursor: newest.body.newestCursor,
    });
  });

  it("validates the query", async () => {
    const { newestCursor } = (await page(SARAH)).body;
    for (const [query, path] of [
      [{ limit: "51" }, "limit"],
      [{ limit: "0" }, "limit"],
      [{ before: "nope" }, "before"],
      [{ after: "nope" }, "after"],
      [{ before: newestCursor, after: newestCursor }, "after"],
      [{ limit: ["1", "2"] }, "limit"],
    ] as [Record<string, string>, string][]) {
      expectInvalid(await page(SARAH, query), path, JSON.stringify(query));
    }
  });

  it("answers 404 to non-members", async () => {
    actAs("devmarco");
    expectError(await page(SARAH), 404, "not_found");
  });
});

describe("POST /api/conversations/:id/messages", () => {
  it("sends text, replays a retry with the same status and refuses a reused key", async () => {
    const key = newKey();
    const sent = await say(MARCO, "  Lunch at 1?\u0007 ", key);

    expect(sent.statusCode).toBe(201);
    expect(sent.headers["idempotent-replayed"]).toBeUndefined();
    expect(sent.body.message).toMatchObject({
      conversationId: MARCO,
      author: { username: "illlhanozkan" },
      body: { type: "text", text: "Lunch at 1?", tweet: null, story: null },
    });
    expect(sent.body.message.id).toMatch(/^msg-[0-9a-f]{32}$/);

    const replay = await say(MARCO, "Lunch at 1?", key);
    expect(replay.statusCode).toBe(201);
    expect(replay.headers["idempotent-replayed"]).toBe("true");
    expect(replay.body).toEqual(sent.body);

    expectError(
      await say(MARCO, "Something else", key),
      422,
      "idempotency_key_reused"
    );
    const texts = (await page(MARCO)).body.items.filter(
      (m: IMessage) => m.id === sent.body.message.id
    );
    expect(texts).toHaveLength(1);

    actAs("devmarco");
    const inbox = (await call(api.conversations)).body.items;
    expect(inbox.find((c: IConversation) => c.id === MARCO).unread).toBe(1);
  });

  it("validates text, Tweet and story ids", async () => {
    const long = "x".repeat(1_001);
    for (const [body, path] of [
      [{}, "text"],
      [{ text: "" }, "text"],
      [{ text: " \n " }, "text"],
      [{ text: long }, "text"],
      [{ text: 42 }, "text"],
      [{ text: "", tweetId: "bad.id" }, "tweetId"],
      [{ text: "Hi", storyId: "drafts.x" }, "storyId"],
    ] as [Record<string, unknown>, string][]) {
      expectInvalid(
        await call(api.messages, keyed(MARCO, body)),
        path,
        JSON.stringify(body).slice(0, 40)
      );
    }
    expect((await say(MARCO, "x".repeat(1_000))).statusCode).toBe(201);
    // Emoji count once.
    expect((await say(MARCO, "👋".repeat(1_000))).statusCode).toBe(201);
  });

  it("shares a Tweet without text, and 404s missing Tweets and stories", async () => {
    const shared = await call(
      api.messages,
      keyed(MARCO, { text: "", tweetId: "seed-t03" })
    );
    expect(shared.statusCode).toBe(201);
    expect(shared.body.message.body).toMatchObject({
      type: "text",
      text: "",
      tweet: { id: "seed-t03", author: { username: "lenaframes" } },
    });

    expectError(
      await call(api.messages, keyed(MARCO, { text: "", tweetId: "seed-t99" })),
      404,
      "not_found",
      "moderated Tweet"
    );
    expectError(
      await call(api.messages, keyed(MARCO, { text: "Hi", tweetId: "nope" })),
      404,
      "not_found",
      "missing Tweet"
    );
    // Stories ship in their own PR; until then no story exists.
    const story = await call(
      api.messages,
      keyed(MARCO, { text: "Nice!", storyId: "story-1" })
    );
    expectError(story, 404, "not_found", "story");
    expect(story.body.error.message).toBe("Story not found");
  });

  it("requires a well-formed Idempotency-Key", async () => {
    const missing = await call(api.messages, {
      method: "POST",
      query: { id: MARCO },
      ...json({ text: "Hi" }),
    });
    expectInvalid(missing, "Idempotency-Key");
    expectInvalid(
      await call(api.messages, keyed(MARCO, { text: "Hi" }, "short")),
      "Idempotency-Key"
    );
  });

  it("answers 404 to non-members and for unknown conversations", async () => {
    actAs("devmarco");
    expectError(await say(SARAH, "Hi"), 404, "not_found");
    expectError(await say("dm-nobody-noone", "Hi"), 404, "not_found");
    expectError(await say("not.a.key", "Hi"), 404, "not_found");
  });
});

describe("POST /api/conversations/:id/payments", () => {
  it("pays the other member and posts the payment in the chat", async () => {
    const before = await balance();
    const key = newKey();
    const res = await call(
      api.payments,
      keyed(SARAH, { amount: 450, note: " Coffee ☕ " }, key)
    );

    expect(res.statusCode).toBe(201);
    const { message, transfer, wallet } = res.body;
    expect(transfer).toMatchObject({
      kind: "payment",
      amount: 450,
      note: "Coffee ☕",
      from: { username: "illlhanozkan" },
      to: { username: "sarahcodes" },
      context: { type: "conversation", id: SARAH },
    });
    expect(res.headers.location).toBe(`/api/wallet/transfers/${transfer.id}`);
    expect(message).toMatchObject({
      id: `msg-${transfer.id.slice(3)}`,
      body: {
        type: "payment",
        transferId: transfer.id,
        amount: 450,
        note: "Coffee ☕",
      },
    });
    expect(wallet.balance).toBe(before - 450);

    const replay = await call(
      api.payments,
      keyed(SARAH, { amount: 450, note: "Coffee ☕" }, key)
    );
    expect(replay.statusCode).toBe(201);
    expect(replay.headers["idempotent-replayed"]).toBe("true");
    expect(replay.body).toEqual(res.body);
    expect(await balance()).toBe(before - 450);
    expectError(
      await call(api.payments, keyed(SARAH, { amount: 500 }, key)),
      422,
      "idempotency_key_reused"
    );
  });

  it("validates the amount and note, and needs a key", async () => {
    for (const [body, path] of [
      [{}, "amount"],
      [{ amount: 12.5 }, "amount"],
      [{ amount: "450" }, "amount"],
      [{ amount: 0 }, "amount"],
      [{ amount: -100 }, "amount"],
      [{ amount: 49 }, "amount"],
      [{ amount: 20_001 }, "amount"],
      [{ amount: 100, note: "n".repeat(101) }, "note"],
    ] as [Record<string, unknown>, string][]) {
      expectInvalid(
        await call(api.payments, keyed(SARAH, body)),
        path,
        JSON.stringify(body).slice(0, 40)
      );
    }
    expectInvalid(
      await call(api.payments, {
        method: "POST",
        query: { id: SARAH },
        ...json({ amount: 100 }),
      }),
      "Idempotency-Key"
    );
  });

  it("answers 402 without posting anything, and 404 to non-members", async () => {
    // Priya has her 100.00 welcome credits.
    actAs("nightowl_dev");
    await open("illlhanozkan");
    const res = await call(api.payments, keyed(NIGHTOWL, { amount: 20_000 }));
    expectError(res, 402, "insufficient_funds");
    expect((await page(NIGHTOWL)).body.items).toEqual([]);

    actAs("devmarco");
    expectError(
      await call(api.payments, keyed(SARAH, { amount: 100 })),
      404,
      "not_found"
    );
  });

  it("answers 403 wallet_frozen when either wallet is frozen", async () => {
    state().wallet.frozen.add("sarahcodes");
    expectError(
      await call(api.payments, keyed(SARAH, { amount: 100 })),
      403,
      "wallet_frozen"
    );
  });
});

describe("POST /api/conversations/:id/requests", () => {
  it("asks the other member to pay, and the bubble follows the request", async () => {
    const key = newKey();
    const res = await call(
      api.requests,
      keyed(MARCO, { amount: 300, note: "Parking" }, key)
    );

    expect(res.statusCode).toBe(201);
    const { message, request } = res.body;
    expect(request).toMatchObject({
      requester: { username: "illlhanozkan" },
      payer: { username: "devmarco" },
      amount: 300,
      note: "Parking",
      status: "pending",
      conversationId: MARCO,
    });
    expect(request.id).toMatch(/^req-[0-9a-f]{32}$/);
    expect(res.headers.location).toBe(`/api/wallet/requests/${request.id}`);
    expect(message.body).toEqual({ type: "request", request });

    const replay = await call(
      api.requests,
      keyed(MARCO, { amount: 300, note: "Parking" }, key)
    );
    expect(replay.headers["idempotent-replayed"]).toBe("true");
    expect(replay.body).toEqual(res.body);

    // Marco pays it from his wallet; the chat shows it paid.
    actAs("devmarco");
    const paid = await call(api.pay, {
      method: "POST",
      query: { id: request.id },
      headers: { "idempotency-key": newKey() },
    });
    expect(paid.statusCode).toBe(200);
    const bubble = (await page(MARCO)).body.items.find(
      (m: IMessage) => m.id === message.id
    );
    expect(bubble.body.request.status).toBe("paid");
  });

  it("validates the amount and answers 404 to non-members", async () => {
    expectInvalid(
      await call(api.requests, keyed(MARCO, { amount: 10 })),
      "amount"
    );
    actAs("sarahcodes");
    expectError(
      await call(api.requests, keyed(MARCO, { amount: 100 })),
      404,
      "not_found"
    );
  });
});

describe("PUT /api/conversations/:id/read", () => {
  it("marks a conversation read for the current user only", async () => {
    const res = await call(api.read, { method: "PUT", query: { id: SARAH } });
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);

    const inbox = (await call(api.conversations)).body.items;
    expect(inbox.find((c: IConversation) => c.id === SARAH).unread).toBe(0);
    expect((await call(api.activity)).body.unreadConversations).toBe(0);

    // Sarah sees it was read.
    actAs("sarahcodes");
    const fromSarah = (await call(api.conversation, { query: { id: SARAH } }))
      .body.conversation;
    expect(
      Math.abs(Date.parse(fromSarah.otherReadAt) - Date.now())
    ).toBeLessThan(5_000);
  });

  it("answers 404 to non-members", async () => {
    actAs("devmarco");
    expectError(
      await call(api.read, { method: "PUT", query: { id: SARAH } }),
      404,
      "not_found"
    );
  });
});

describe("identity", () => {
  it("ignores identity fields in bodies", async () => {
    const impostor = {
      from: "mallory",
      to: "mallory",
      username: "mallory",
      author: "mallory",
      sender: "mallory",
      payer: "mallory",
      requester: "mallory",
    };

    const message = await call(
      api.messages,
      keyed(MARCO, { ...impostor, text: "Hi" })
    );
    expect(message.body.message.author.username).toBe("illlhanozkan");

    const payment = await call(
      api.payments,
      keyed(MARCO, { ...impostor, amount: 100 })
    );
    expect(payment.body.transfer.from.username).toBe("illlhanozkan");
    expect(payment.body.transfer.to.username).toBe("devmarco");

    const request = await call(
      api.requests,
      keyed(MARCO, { ...impostor, amount: 100 })
    );
    expect(request.body.request.requester.username).toBe("illlhanozkan");
    expect(request.body.request.payer.username).toBe("devmarco");

    const opened = await call(api.conversations, {
      method: "POST",
      ...json({ ...impostor, with: "nightowl_dev" }),
    });
    expect(opened.body.conversation.id).toBe(NIGHTOWL);
  });
});

/** Every write, ready to call (fresh keys each time). */
const writes = (): [string, Handler, MockRequest][] => [
  [
    "POST conversations",
    api.conversations,
    { method: "POST", ...json({ with: "nightowl_dev" }) },
  ],
  ["POST messages", api.messages, keyed(MARCO, { text: "Hi" })],
  ["POST payments", api.payments, keyed(MARCO, { amount: 100 })],
  ["POST requests", api.requests, keyed(MARCO, { amount: 100 })],
  ["PUT read", api.read, { method: "PUT", query: { id: SARAH } }],
];

describe("write protections", () => {
  it("rejects every write with 403 read_only in READ_ONLY mode", async () => {
    vi.stubEnv("READ_ONLY", "true");
    for (const [name, handler, request] of writes()) {
      expectError(await call(handler, request), 403, "read_only", name);
    }
    // Reads still work, and nothing was marked read.
    const inbox = await call(api.conversations);
    expect(inbox.statusCode).toBe(200);
    expect(
      inbox.body.items.find((c: IConversation) => c.id === SARAH).unread
    ).toBe(1);
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

  it("limits messages to 30 a minute per user (429 with Retry-After)", async () => {
    // Above the per-client write limit, so only the per-user budget applies.
    vi.stubEnv("WRITE_RATE_LIMIT", "100");
    for (let i = 0; i < 30; i++) {
      expect((await say(MARCO, `Hi ${i}`)).statusCode, `send ${i + 1}`).toBe(
        201
      );
    }
    const limited = await say(MARCO, "One more");
    expectError(limited, 429, "rate_limited");
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);

    // Money in chat uses the money budget, not this one.
    expect(
      (await call(api.payments, keyed(MARCO, { amount: 100 }))).statusCode
    ).toBe(201);
    // Rejected sends don't use the budget, and others have their own.
    expectInvalid(await call(api.messages, keyed(MARCO, { text: "" })), "text");
    actAs("devmarco");
    expect((await say(MARCO, "Hi")).statusCode).toBe(201);
  });

  it("shares the money budget with the wallet", async () => {
    for (let i = 0; i < 12; i++) {
      const res = await call(api.transfers, {
        method: "POST",
        ...json(
          { to: "sarahcodes", amount: 50 },
          { "idempotency-key": newKey() }
        ),
      });
      expect(res.statusCode, `send ${i + 1}`).toBe(201);
    }
    for (const [label, res] of [
      ["payment", await call(api.payments, keyed(MARCO, { amount: 100 }))],
      ["request", await call(api.requests, keyed(MARCO, { amount: 100 }))],
    ] as const) {
      expectError(res, 429, "rate_limited", label);
    }
  });

  it("parses bodies only on routes that take one", async () => {
    const config = async (path: string) => {
      const specifier = "../../" + path;
      return (await import(specifier)).config;
    };

    for (const path of [
      ROUTES.conversations,
      ROUTES.messages,
      ROUTES.payments,
      ROUTES.requests,
    ]) {
      expect(await config(path), path).toEqual({
        api: { bodyParser: { sizeLimit: "16kb" } },
      });
    }
    for (const path of [ROUTES.conversation, ROUTES.read]) {
      expect(await config(path), path).toEqual({
        api: { bodyParser: false },
      });
    }
  });

  it("answers 405 for methods a route doesn't have", async () => {
    for (const [name, handler, method] of [
      ["conversation", api.conversation, "POST"],
      ["payments", api.payments, "GET"],
      ["read", api.read, "POST"],
    ] as const) {
      const res = await call(handler, { method, query: { id: SARAH } });
      expectError(res, 405, "method_not_allowed", name);
    }
  });
});

describe("feature gating", () => {
  it("turns every conversation route into a 404 with DISABLED_FEATURES=messages", async () => {
    vi.stubEnv("DISABLED_FEATURES", "messages");
    const reads: [string, Handler, MockRequest][] = [
      ["GET conversations", api.conversations, {}],
      ["GET conversation", api.conversation, { query: { id: SARAH } }],
      ["GET messages", api.messages, { query: { id: SARAH } }],
    ];
    for (const [name, handler, request] of [...reads, ...writes()]) {
      const res = await call(handler, request);
      expectError(res, 404, "not_found", name);
      expect(res.body.error.message, name).toBe("This feature is turned off");
    }
    expect((await call(api.me)).body.features.messages).toBe(false);
    expect((await call(api.activity)).body.unreadConversations).toBe(0);
  });

  it("refuses chat payments and requests while the wallet is off, moving nothing", async () => {
    vi.stubEnv("DISABLED_FEATURES", "wallet");
    const wallet = state().wallet;
    const before = {
      balances: new Map(wallet.balances),
      transfers: wallet.transfers.size,
      requests: wallet.requests.size,
      messages: (await page(MARCO)).body.items.length,
    };

    for (const [name, handler] of [
      ["POST payments", api.payments],
      ["POST requests", api.requests],
    ] as [string, Handler][]) {
      const res = await call(handler, keyed(MARCO, { amount: 100 }));
      expectError(res, 404, "not_found", name);
      expect(res.body.error.message, name).toBe("This feature is turned off");
    }

    expect(wallet.balances).toEqual(before.balances);
    expect(wallet.transfers.size).toBe(before.transfers);
    expect(wallet.requests.size).toBe(before.requests);
    expect((await page(MARCO)).body.items).toHaveLength(before.messages);
    // Messages itself stays on: text still sends.
    expect((await say(MARCO, "Still here")).statusCode).toBe(201);
    expect((await call(api.me)).body.features).toMatchObject({
      messages: true,
      wallet: false,
    });
    expectError(await call(api.wallet), 404, "not_found");
  });

  it("answers 503 to chat money while the wallet is unconfigured", async () => {
    const { getRepository } = await import("../../lib/db");
    const repo = getRepository();
    const statusOf = repo.featureStatus.bind(repo);
    vi.spyOn(repo, "featureStatus").mockImplementation((id) =>
      id === "wallet" ? "unconfigured" : statusOf(id)
    );
    const before = {
      balance: storedBalance(),
      requests: state().wallet.requests.size,
    };

    for (const [name, handler] of [
      ["POST payments", api.payments],
      ["POST requests", api.requests],
    ] as [string, Handler][]) {
      const res = await call(handler, keyed(MARCO, { amount: 100 }));
      expectError(res, 503, "service_unavailable", name);
      expect(res.body.error.message, name).toBe(
        "Wallet needs SANITY_API_TOKEN on this deployment"
      );
    }
    expect(storedBalance()).toBe(before.balance);
    expect(state().wallet.requests.size).toBe(before.requests);
  });

  it("answers 503 while the data source can't serve messages", async () => {
    vi.stubEnv("DATA_SOURCE", "sanity");
    vi.stubEnv("SANITY_PROJECT_ID", "testproject");
    vi.stubEnv("SANITY_API_TOKEN", "");

    for (const [name, handler, request] of [
      ["GET conversations", api.conversations, {}],
      ...writes(),
    ] as [string, Handler, MockRequest][]) {
      const res = await call(handler, request);
      expectError(res, 503, "service_unavailable", name);
      expect(res.body.error.message, name).toBe(
        "Messages needs SANITY_API_TOKEN on this deployment"
      );
    }
  });
});

describe("messages pages", () => {
  /** getServerSideProps of a messages page, with its query, params and response. */
  async function serverSide(
    page: "index" | "[id]",
    { query = {}, params = {} }: { query?: object; params?: object } = {}
  ) {
    const res = { statusCode: 200 };
    const ctx = { query, params, res } as unknown as GetServerSidePropsContext;
    const { getServerSideProps } = await import(
      page === "index"
        ? "../../pages/messages/index"
        : "../../pages/messages/[id]"
    );
    const result = (await getServerSideProps(ctx)) as Record<string, any>;
    return { result, status: res.statusCode };
  }

  const conversationIds = () => [...state().messages.conversations.keys()];

  it("serves the inbox", async () => {
    const { result, status } = await serverSide("index");
    expect(status).toBe(200);
    expect(result.props).toMatchObject({ feature: "on", draft: null });
    const inbox = result.props.initialState.messages.inbox;
    expect(inbox.loaded).toBe(true);
    expect(inbox.items.find((c: IConversation) => c.id === SARAH).unread).toBe(
      1
    );
  });

  it("redirects ?to= to an existing conversation (307), any casing", async () => {
    for (const to of ["devmarco", "DevMarco"]) {
      const { result } = await serverSide("index", { query: { to } });
      expect(result.redirect, to).toEqual({
        destination: `/messages/${MARCO}`,
        permanent: false,
      });
    }
  });

  it("shows a draft for someone new and writes nothing", async () => {
    const before = conversationIds();
    const { result, status } = await serverSide("index", {
      query: { to: "nightowl_dev" },
    });
    expect(status).toBe(200);
    expect(result.props.draft).toEqual({
      other: {
        username: "nightowl_dev",
        fullname: "Priya Nair",
        image: expect.any(String),
      },
      conversationId: NIGHTOWL,
      serverNow: expect.any(String),
    });
    expect(conversationIds()).toEqual(before);
    expect(
      (await call(api.conversation, { query: { id: NIGHTOWL } })).statusCode
    ).toBe(404);
  });

  it("shows a not-found state for yourself and for unknown people", async () => {
    for (const [to, problem] of [
      ["IlllhanOzkan", "self"],
      ["ghost_user", "unknown"],
      ["not a username", "unknown"],
    ]) {
      const { result, status } = await serverSide("index", { query: { to } });
      expect(status, to).toBe(404);
      expect(result.props.draft, to).toEqual({ problem });
    }
  });

  it("says Messages is off instead of a 404, since the nav links here", async () => {
    vi.stubEnv("DISABLED_FEATURES", "messages");
    const { result, status } = await serverSide("index", {
      query: { to: "devmarco" },
    });
    expect(status).toBe(200);
    expect(result.props).toMatchObject({ feature: "off", draft: null });
  });

  it("serves a conversation to its members without marking it read", async () => {
    const { result } = await serverSide("[id]", { params: { id: SARAH } });
    expect(result.props).toMatchObject({
      conversationId: SARAH,
      other: { username: "sarahcodes" },
    });
    const thread = result.props.initialState.messages.threads[SARAH];
    expect(thread.conversation.unread).toBe(1);
    expect(thread.messages.at(-1).body.request.id).toBe("seed-req01");
    // GET never writes: still unread.
    expect((await call(api.activity)).body.unreadConversations).toBe(1);
  });

  it("is a 404 for anyone else and for bad ids", async () => {
    actAs("sarahcodes");
    expect(
      (await serverSide("[id]", { params: { id: MARCO } })).result
    ).toEqual({ notFound: true });
    expect(
      (await serverSide("[id]", { params: { id: "drafts.x" } })).result
    ).toEqual({ notFound: true });
  });

  it("is a 404 while Messages is off", async () => {
    vi.stubEnv("DISABLED_FEATURES", "messages");
    expect(
      (await serverSide("[id]", { params: { id: SARAH } })).result
    ).toEqual({ notFound: true });
  });
});
