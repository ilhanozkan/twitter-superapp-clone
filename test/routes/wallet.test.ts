import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MemoryState } from "../../lib/db/memory";
import { IPaymentRequest, ITransfer, IWallet } from "../../types/Wallet";
import { call, freshApi, json, MockRequest, MockResponse } from "../api";

// The foundation's SuperApp endpoints on a fresh superapp-world memory store.
// Lanes add seed data to this world, so these tests assert deltas and F's
// own seed records, never whole-world totals (balances, counts).

const ROUTES = {
  wallet: "pages/api/wallet/index",
  activity: "pages/api/wallet/activity",
  transfers: "pages/api/wallet/transfers/index",
  transfer: "pages/api/wallet/transfers/[id]",
  topUps: "pages/api/wallet/top-ups",
  requests: "pages/api/wallet/requests/index",
  request: "pages/api/wallet/requests/[id]/index",
  pay: "pages/api/wallet/requests/[id]/pay",
  decline: "pages/api/wallet/requests/[id]/decline",
  cancel: "pages/api/wallet/requests/[id]/cancel",
  tip: "pages/api/tweets/[id]/tip",
  tweets: "pages/api/tweets/index",
  tweet: "pages/api/tweets/[id]/index",
  users: "pages/api/users/index",
  shellActivity: "pages/api/activity",
  places: "pages/api/places",
  me: "pages/api/me",
  notifications: "pages/api/notifications",
} as const;

type Handler = Parameters<typeof call>[0];
let api: Record<keyof typeof ROUTES, Handler>;

let keyCount = 0;
const newKey = () => `test-key-${String(++keyCount).padStart(6, "0")}`;

/** A keyed JSON write. */
const keyed = (
  body: unknown,
  key = newKey(),
  headers: Record<string, string> = {}
): MockRequest => ({
  method: "POST",
  ...json(body, { "idempotency-key": key, ...headers }),
});

/** A keyed write without a body. */
const keyedNoBody = (query: Record<string, string>, key = newKey()) => ({
  method: "POST",
  query,
  headers: { "idempotency-key": key },
});

const state = () =>
  (globalThis as { __superappMemoryState?: MemoryState })
    .__superappMemoryState!;

const freeze = (username: string) =>
  state().wallet.frozen.add(username.toLowerCase());

const actAs = (username: string) => vi.stubEnv("DEMO_USERNAME", username);

async function myWallet(): Promise<IWallet> {
  const res = await call(api.wallet);
  expect(res.statusCode).toBe(200);
  return res.body.wallet;
}

const send = (body: Record<string, unknown>, key?: string) =>
  call(api.transfers, keyed({ to: "sarahcodes", amount: 50, ...body }, key));

/** Asks `from` to pay the current user. */
async function createRequest(from: string, amount = 450) {
  const res = await call(api.requests, keyed({ from, amount }));
  expect(res.statusCode).toBe(201);
  return res.body.request as IPaymentRequest;
}

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
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/wallet", () => {
  it("returns the current user's wallet, limits and the server clock", async () => {
    const res = await call(api.wallet);

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    const { wallet, limits, serverNow } = res.body;
    expect(wallet).toMatchObject({
      username: "illlhanozkan",
      frozen: false,
    });
    expect(wallet.available).toBe(wallet.balance - wallet.pending);
    expect(limits).toMatchObject({
      minPayment: 50,
      maxPayment: 20_000,
      minTip: 50,
      maxTip: 5_000,
      topUpAmounts: [2_500, 5_000, 10_000],
      topUpCap: 100_000,
      topUpsPerDay: 3,
    });
    expect(Math.abs(Date.parse(serverNow) - Date.now())).toBeLessThan(5_000);
  });

  it("reads a user without a wallet as empty, and never creates one", async () => {
    actAs("newcomer");

    expect(await myWallet()).toEqual({
      username: "newcomer",
      balance: 0,
      pending: 0,
      available: 0,
      frozen: false,
    });
    expect((await call(api.activity)).body).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(
      (await call(api.requests, { query: { role: "outgoing" } })).body
    ).toEqual({ items: [] });
    // GET never writes.
    expect(state().wallet.balances.has("newcomer")).toBe(false);
  });
});

describe("POST /api/wallet/transfers", () => {
  it("sends credits as the current user and links the receipt", async () => {
    const before = await myWallet();
    const res = await call(
      api.transfers,
      keyed({ to: "SarahCodes", amount: 250, note: "  Coffee ☕\u0007 " })
    );

    expect(res.statusCode).toBe(201);
    expect(res.headers["idempotent-replayed"]).toBeUndefined();
    const transfer: ITransfer = res.body.transfer;
    expect(transfer).toMatchObject({
      kind: "payment",
      amount: 250,
      note: "Coffee ☕",
      from: { username: "illlhanozkan" },
      to: { username: "sarahcodes", fullname: "Sarah Chen" },
      context: null,
      holdUntil: null,
    });
    expect(transfer.id).toMatch(/^tx-[0-9a-f]{32}$/);
    expect(res.headers.location).toBe(`/api/wallet/transfers/${transfer.id}`);
    expect(res.body.wallet.balance).toBe(before.balance - 250);
    expect(await myWallet()).toEqual(res.body.wallet);

    const receipt = await call(api.transfer, { query: { id: transfer.id } });
    expect(receipt.statusCode).toBe(200);
    expect(receipt.headers["cache-control"]).toBe("private, no-store");
    expect(receipt.body.transfer).toEqual(transfer);

    const activity = await call(api.activity, { query: { limit: "1" } });
    expect(activity.body.items).toEqual([transfer]);
    expect(typeof activity.body.nextCursor).toBe("string");
  });

  it("stores a blank note as null", async () => {
    const res = await send({ note: " \n " });
    expect(res.statusCode).toBe(201);
    expect(res.body.transfer.note).toBeNull();
  });

  it("validates the amount, the note and the recipient", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ amount: 12.5 }, "amount"],
      [{ amount: "250" }, "amount"],
      [{ amount: 0 }, "amount"],
      [{ amount: -100 }, "amount"],
      [{ amount: 49 }, "amount"],
      [{ amount: 20_001 }, "amount"],
      [{ amount: undefined }, "amount"],
      [{ note: "x".repeat(101) }, "note"],
      [{ note: 42 }, "note"],
      [{ to: "not valid!" }, "to"],
      [{ to: undefined }, "to"],
      [{ to: 42 }, "to"],
    ];
    for (const [body, path] of cases) {
      expectInvalid(await send(body), path, JSON.stringify(body));
    }

    // Exactly 100 code points is fine, and the maximum amount too.
    expect((await send({ note: "😀".repeat(100) })).statusCode).toBe(201);
    expect((await send({ amount: 20_000 })).statusCode).toBe(201);
  });

  it("refuses sending to yourself (400) and to unknown users (404)", async () => {
    const self = await send({ to: "ILLLHANOZKAN" });
    expectInvalid(self, "to");
    expect(self.body.error.details[0].message).toBe(
      "You can't send credits to yourself"
    );

    const ghost = await send({ to: "ghost" });
    expectError(ghost, 404, "not_found");
    expect(ghost.body.error.message).toBe("User not found");
  });

  it("requires a well-formed Idempotency-Key", async () => {
    const body = { to: "sarahcodes", amount: 50 };
    const missing = await call(api.transfers, {
      method: "POST",
      ...json(body),
    });
    expectInvalid(missing, "Idempotency-Key");

    for (const key of [
      "short",
      "has spaces in it",
      "a.b.c.d.e",
      "x".repeat(65),
    ]) {
      expectInvalid(
        await call(api.transfers, keyed(body, key)),
        "Idempotency-Key",
        key
      );
    }
  });

  it("replays a retried request once and refuses a reused key", async () => {
    const before = await myWallet();
    const key = newKey();

    const first = await send({ amount: 300, note: "Rent" }, key);
    const retry = await send({ amount: 300, note: "Rent" }, key);
    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(201);
    expect(retry.headers["idempotent-replayed"]).toBe("true");
    expect(retry.body.transfer).toEqual(first.body.transfer);
    expect((await myWallet()).balance).toBe(before.balance - 300);

    const reused = await send({ amount: 301, note: "Rent" }, key);
    expectError(reused, 422, "idempotency_key_reused");
    expect((await myWallet()).balance).toBe(before.balance - 300);
  });

  it("keeps the same key from another user a separate operation", async () => {
    const key = newKey();
    const mine = await send({}, key);

    actAs("sarahcodes");
    const hers = await call(
      api.transfers,
      keyed({ to: "illlhanozkan", amount: 50 }, key)
    );
    expect(hers.statusCode).toBe(201);
    expect(hers.headers["idempotent-replayed"]).toBeUndefined();
    expect(hers.body.transfer.id).not.toBe(mine.body.transfer.id);
  });

  it("answers 402 when the sender's available credits don't cover it", async () => {
    actAs("newcomer");
    const res = await send({ amount: 100 });
    expectError(res, 402, "insufficient_funds");
  });

  it("answers 403 wallet_frozen when either wallet is frozen", async () => {
    freeze("sarahcodes");
    expectError(await send({}), 403, "wallet_frozen");

    state().wallet.frozen.clear();
    freeze("illlhanozkan");
    expectError(await send({}), 403, "wallet_frozen");
  });
});

describe("POST /api/wallet/top-ups", () => {
  it("adds demo credits", async () => {
    const before = await myWallet();
    const res = await call(api.topUps, keyed({ amount: 2_500 }));

    expect(res.statusCode).toBe(201);
    expect(res.body.transfer).toMatchObject({
      kind: "issue",
      amount: 2_500,
      from: null,
      to: { username: "illlhanozkan" },
    });
    expect(res.headers.location).toBe(
      `/api/wallet/transfers/${res.body.transfer.id}`
    );
    expect(res.body.wallet.balance).toBe(before.balance + 2_500);
  });

  it("only takes the offered amounts", async () => {
    for (const amount of [3_000, 25, "2500", 2_500.5, 0, -2_500, undefined]) {
      expectInvalid(
        await call(api.topUps, keyed({ amount })),
        "amount",
        String(amount)
      );
    }
  });

  it("allows 3 top-ups a day (422 after)", async () => {
    actAs("newcomer");
    for (let i = 0; i < 3; i++) {
      expect(
        (await call(api.topUps, keyed({ amount: 2_500 }))).statusCode
      ).toBe(201);
    }
    expectError(
      await call(api.topUps, keyed({ amount: 2_500 })),
      422,
      "limit_exceeded"
    );

    const { limits, wallet } = (await call(api.wallet)).body;
    expect(limits.topUpsLeftToday).toBe(0);
    expect(wallet.balance).toBe(7_500);
  });

  it("refuses a frozen wallet", async () => {
    freeze("illlhanozkan");
    expectError(
      await call(api.topUps, keyed({ amount: 2_500 })),
      403,
      "wallet_frozen"
    );
  });
});

describe("payment requests", () => {
  it("asks the other person to pay the current user", async () => {
    const res = await call(
      api.requests,
      keyed({ from: "SarahCodes", amount: 450, note: " Lunch 🥙 " })
    );

    expect(res.statusCode).toBe(201);
    const request: IPaymentRequest = res.body.request;
    expect(request).toMatchObject({
      requester: { username: "illlhanozkan" },
      payer: { username: "sarahcodes", fullname: "Sarah Chen" },
      amount: 450,
      note: "Lunch 🥙",
      status: "pending",
      respondedAt: null,
      transferId: null,
      conversationId: null,
    });
    expect(request.id).toMatch(/^req-[0-9a-f]{32}$/);
    expect(res.headers.location).toBe(`/api/wallet/requests/${request.id}`);

    const read = await call(api.request, { query: { id: request.id } });
    expect(read.statusCode).toBe(200);
    expect(read.headers["cache-control"]).toBe("private, no-store");
    expect(read.body.request).toEqual(request);

    const outgoing = await call(api.requests, {
      query: { role: "outgoing", status: "pending" },
    });
    expect(outgoing.headers["cache-control"]).toBe("private, no-store");
    expect(outgoing.body.items[0]).toEqual(request);

    actAs("sarahcodes");
    const incoming = await call(api.requests, { query: { role: "incoming" } });
    expect(
      incoming.body.items.map((item: IPaymentRequest) => item.id)
    ).toContain(request.id);
  });

  it("validates new requests", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ from: "sarahcodes", amount: 0 }, "amount"],
      [{ from: "sarahcodes", amount: 4.5 }, "amount"],
      [{ from: "sarahcodes", amount: 20_001 }, "amount"],
      [{ from: "sarahcodes", amount: 450, note: "x".repeat(101) }, "note"],
      [{ from: "not valid!", amount: 450 }, "from"],
      [{ amount: 450 }, "from"],
      [{ from: "Illlhanozkan", amount: 450 }, "from"],
    ];
    for (const [body, path] of cases) {
      expectInvalid(
        await call(api.requests, keyed(body)),
        path,
        JSON.stringify(body)
      );
    }

    expectError(
      await call(api.requests, keyed({ from: "ghost", amount: 450 })),
      404,
      "not_found"
    );
    expectInvalid(
      await call(api.requests, {
        method: "POST",
        ...json({ from: "sarahcodes", amount: 450 }),
      }),
      "Idempotency-Key"
    );
  });

  it("validates the list query", async () => {
    const queries: Record<string, string | string[]>[] = [
      {},
      { role: "both" },
      { role: "incoming", status: "bogus" },
      { role: ["incoming", "outgoing"] },
    ];
    for (const query of queries) {
      expectInvalid(
        await call(api.requests, { query }),
        Object.keys(query).includes("status") ? "status" : "role",
        JSON.stringify(query)
      );
    }

    const pending = await call(api.requests, {
      query: { role: "incoming", status: "pending" },
    });
    expect(pending.statusCode).toBe(200);
    for (const request of pending.body.items as IPaymentRequest[]) {
      expect(request.status).toBe("pending");
      expect(request.payer.username).toBe("illlhanozkan");
    }
    // F's seed asks the demo user to pay seed-req03 and seed-req04.
    expect(pending.body.items.map((item: IPaymentRequest) => item.id)).toEqual(
      expect.arrayContaining(["seed-req03", "seed-req04"])
    );
  });

  it("lets the payer pay once, replaying a retry", async () => {
    actAs("sarahcodes");
    const request = await createRequest("illlhanozkan", 375);
    actAs("illlhanozkan");
    const before = await myWallet();
    const key = newKey();

    const paid = await call(api.pay, keyedNoBody({ id: request.id }, key));
    expect(paid.statusCode).toBe(200);
    expect(paid.body.request).toMatchObject({
      id: request.id,
      status: "paid",
      transferId: paid.body.transfer.id,
    });
    expect(paid.body.transfer).toMatchObject({
      kind: "request",
      amount: 375,
      from: { username: "illlhanozkan" },
      to: { username: "sarahcodes" },
      context: { type: "request", id: request.id },
    });
    expect(paid.body.wallet.balance).toBe(before.balance - 375);

    const retry = await call(api.pay, keyedNoBody({ id: request.id }, key));
    expect(retry.statusCode).toBe(200);
    expect(retry.headers["idempotent-replayed"]).toBe("true");
    expect(retry.body.transfer).toEqual(paid.body.transfer);

    expectError(
      await call(api.pay, keyedNoBody({ id: request.id })),
      409,
      "invalid_state"
    );
    expect((await myWallet()).balance).toBe(before.balance - 375);

    // Both parties can read the receipt.
    actAs("sarahcodes");
    expect(
      (await call(api.transfer, { query: { id: paid.body.transfer.id } }))
        .statusCode
    ).toBe(200);
  });

  it("requires a key to pay, and lets only the payer pay", async () => {
    const mine = await createRequest("sarahcodes");

    expectInvalid(
      await call(api.pay, { method: "POST", query: { id: mine.id } }),
      "Idempotency-Key"
    );
    const own = await call(api.pay, keyedNoBody({ id: mine.id }));
    expectError(own, 403, "forbidden");
    expect(own.body.error.message).toBe("You can't pay your own request");
  });

  it("answers 402 when the payer can't cover it", async () => {
    // The demo bot only ever holds what it is about to spend: 0.
    const request = await createRequest("demo_customer", 500);
    actAs("demo_customer");
    expectError(
      await call(api.pay, keyedNoBody({ id: request.id })),
      402,
      "insufficient_funds"
    );
  });

  it("declines idempotently; the requester can't decline", async () => {
    actAs("sarahcodes");
    const request = await createRequest("illlhanozkan");
    expectError(
      await call(api.decline, { method: "POST", query: { id: request.id } }),
      403,
      "forbidden"
    );

    actAs("illlhanozkan");
    const declined = await call(api.decline, {
      method: "POST",
      query: { id: request.id },
    });
    expect(declined.statusCode).toBe(200);
    expect(declined.body.request).toMatchObject({
      id: request.id,
      status: "declined",
    });

    const again = await call(api.decline, {
      method: "POST",
      query: { id: request.id },
    });
    expect(again.statusCode).toBe(200);
    expect(again.body.request).toEqual(declined.body.request);

    expectError(
      await call(api.pay, keyedNoBody({ id: request.id })),
      409,
      "invalid_state"
    );
    actAs("sarahcodes");
    expectError(
      await call(api.cancel, { method: "POST", query: { id: request.id } }),
      409,
      "invalid_state"
    );
  });

  it("cancels idempotently; the payer can't cancel", async () => {
    const request = await createRequest("sarahcodes");

    actAs("sarahcodes");
    expectError(
      await call(api.cancel, { method: "POST", query: { id: request.id } }),
      403,
      "forbidden"
    );

    actAs("illlhanozkan");
    for (let i = 0; i < 2; i++) {
      const cancelled = await call(api.cancel, {
        method: "POST",
        query: { id: request.id },
      });
      expect(cancelled.statusCode).toBe(200);
      expect(cancelled.body.request.status).toBe("cancelled");
    }

    actAs("sarahcodes");
    expectError(
      await call(api.decline, { method: "POST", query: { id: request.id } }),
      409,
      "invalid_state"
    );
  });

  it("can't be paid once it expired", async () => {
    actAs("sarahcodes");
    const request = await createRequest("illlhanozkan");
    actAs("illlhanozkan");

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse(request.expiresAt) + 1_000);

    const read = await call(api.request, { query: { id: request.id } });
    expect(read.body.request.status).toBe("expired");
    const paid = await call(api.pay, keyedNoBody({ id: request.id }));
    expectError(paid, 409, "invalid_state");
    expect(paid.body.error.message).toBe("This request expired");
  });

  it("answers 404 for unknown and malformed ids", async () => {
    for (const id of ["req-missing", "private.seed-req03", "a/b"]) {
      expectError(
        await call(api.request, { query: { id } }),
        404,
        "not_found",
        id
      );
      expectError(
        await call(api.pay, keyedNoBody({ id })),
        404,
        "not_found",
        id
      );
      expectError(
        await call(api.decline, { method: "POST", query: { id } }),
        404,
        "not_found",
        id
      );
    }
  });
});

describe("visibility", () => {
  it("shows receipts and requests only to their parties (404 for others)", async () => {
    // F's seed: seed-tx01 is the demo user's tip to lenaframes; devmarco
    // asked the demo user to pay seed-req03.
    expect(
      (await call(api.transfer, { query: { id: "seed-tx01" } })).statusCode
    ).toBe(200);
    expect(
      (await call(api.request, { query: { id: "seed-req03" } })).statusCode
    ).toBe(200);

    actAs("sarahcodes");
    const reads: [string, Handler, MockRequest][] = [
      ["GET transfer", api.transfer, { query: { id: "seed-tx01" } }],
      ["GET request", api.request, { query: { id: "seed-req03" } }],
      ["pay", api.pay, keyedNoBody({ id: "seed-req03" })],
      ["decline", api.decline, { method: "POST", query: { id: "seed-req03" } }],
      ["cancel", api.cancel, { method: "POST", query: { id: "seed-req03" } }],
    ];
    for (const [name, handler, request] of reads) {
      const res = await call(handler, request);
      expectError(res, 404, "not_found", name);
    }
    expect(
      (await call(api.transfer, { query: { id: "missing" } })).statusCode
    ).toBe(404);

    // Nothing changed for the parties.
    actAs("illlhanozkan");
    expect(
      (await call(api.request, { query: { id: "seed-req03" } })).body.request
        .status
    ).toBe("pending");
  });
});

describe("POST /api/tweets/:id/tip", () => {
  const tweetOf = async (id: string) =>
    (await call(api.tweet, { query: { id } })).body.tweet;

  it("tips another person's Tweet and returns it updated", async () => {
    const before = await myWallet();
    const { stats } = await tweetOf("seed-t03");

    const res = await call(api.tip, {
      query: { id: "seed-t03" },
      ...keyed({ amount: 200, note: "Great shot" }),
    });

    expect(res.statusCode).toBe(201);
    const transfer: ITransfer = res.body.transfer;
    expect(transfer).toMatchObject({
      kind: "tip",
      amount: 200,
      note: "Great shot",
      from: { username: "illlhanozkan" },
      to: { username: "lenaframes" },
      context: { type: "tweet", id: "seed-t03" },
    });
    expect(res.headers.location).toBe(`/api/wallet/transfers/${transfer.id}`);
    expect(res.body.wallet.balance).toBe(before.balance - 200);
    expect(res.body.tweet).toMatchObject({
      id: "seed-t03",
      stats: { tips: stats.tips + 1 },
      viewer: { tipped: true },
    });

    // The author is told, with the amount.
    actAs("lenaframes");
    const { items } = (await call(api.notifications, { query: { limit: "5" } }))
      .body;
    expect(items[0]).toMatchObject({
      id: `tip-${transfer.id}`,
      type: "tip",
      amount: 200,
      transferId: transfer.id,
      actor: { username: "illlhanozkan" },
      tweet: { id: "seed-t03" },
    });
  });

  it("replays a retry without tipping twice", async () => {
    const key = newKey();
    const request = {
      query: { id: "seed-t03" },
      ...keyed({ amount: 100 }, key),
    };
    const first = await call(api.tip, request);
    const retry = await call(api.tip, request);

    expect(retry.statusCode).toBe(201);
    expect(retry.headers["idempotent-replayed"]).toBe("true");
    expect(retry.body.transfer).toEqual(first.body.transfer);
    expect(retry.body.tweet.stats.tips).toBe(first.body.tweet.stats.tips);

    const reused = await call(api.tip, {
      query: { id: "seed-t03" },
      ...keyed({ amount: 100, note: "different" }, key),
    });
    expectError(reused, 422, "idempotency_key_reused");
  });

  it("refuses your own Tweet (403) and missing or hidden ones (404)", async () => {
    const own = await call(api.tip, {
      query: { id: "seed-t05" },
      ...keyed({ amount: 100 }),
    });
    expectError(own, 403, "forbidden");
    expect(own.body.error.message).toBe("You can't tip your own Tweet");

    for (const id of ["missing", "seed-t99", "../etc"]) {
      expectError(
        await call(api.tip, { query: { id }, ...keyed({ amount: 100 }) }),
        404,
        "not_found",
        id
      );
    }
  });

  it("validates the amount and note", async () => {
    for (const [body, path] of [
      [{ amount: 49 }, "amount"],
      [{ amount: 5_001 }, "amount"],
      [{ amount: 1.5 }, "amount"],
      [{ amount: "100" }, "amount"],
      [{ amount: 100, note: "x".repeat(101) }, "note"],
    ] as const) {
      expectInvalid(
        await call(api.tip, { query: { id: "seed-t03" }, ...keyed(body) }),
        path,
        JSON.stringify(body)
      );
    }
    expect(
      (
        await call(api.tip, {
          query: { id: "seed-t03" },
          ...keyed({ amount: 5_000 }),
        })
      ).statusCode
    ).toBe(201);
  });

  it("answers 402 and 403 wallet_frozen with the shared envelopes", async () => {
    actAs("newcomer");
    const broke = await call(api.tip, {
      query: { id: "seed-t03" },
      ...keyed({ amount: 100 }),
    });
    expectError(broke, 402, "insufficient_funds");
    expect(broke.body.error).toMatchObject({
      message: "Not enough credits available",
      requestId: broke.headers["x-request-id"],
    });

    actAs("illlhanozkan");
    freeze("lenaframes");
    expectError(
      await call(api.tip, {
        query: { id: "seed-t03" },
        ...keyed({ amount: 100 }),
      }),
      403,
      "wallet_frozen"
    );
  });
});

describe("identity", () => {
  it("ignores identity fields in bodies", async () => {
    const impostor = {
      from: "mallory",
      to: "sarahcodes",
      username: "mallory",
      author: "mallory",
      buyer: "mallory",
      payer: "mallory",
      requester: "mallory",
    };

    const sent = await call(api.transfers, keyed({ ...impostor, amount: 50 }));
    expect(sent.body.transfer.from.username).toBe("illlhanozkan");
    expect(sent.body.transfer.to.username).toBe("sarahcodes");

    const topUp = await call(api.topUps, keyed({ ...impostor, amount: 2_500 }));
    expect(topUp.body.transfer.to.username).toBe("illlhanozkan");

    const tip = await call(api.tip, {
      query: { id: "seed-t03" },
      ...keyed({ ...impostor, amount: 100 }),
    });
    expect(tip.body.transfer.from.username).toBe("illlhanozkan");
    expect(tip.body.transfer.to.username).toBe("lenaframes");

    // Here `from` names the other party: who is asked to pay.
    const request = await call(
      api.requests,
      keyed({ ...impostor, from: "sarahcodes", amount: 450 })
    );
    expect(request.body.request.requester.username).toBe("illlhanozkan");
    expect(request.body.request.payer.username).toBe("sarahcodes");
  });
});

/** Every new write, ready to call (fresh keys each time). */
const writes = (): [string, Handler, MockRequest][] => [
  ["POST transfers", api.transfers, keyed({ to: "sarahcodes", amount: 50 })],
  ["POST top-ups", api.topUps, keyed({ amount: 2_500 })],
  ["POST requests", api.requests, keyed({ from: "sarahcodes", amount: 50 })],
  ["POST pay", api.pay, keyedNoBody({ id: "seed-req03" })],
  [
    "POST decline",
    api.decline,
    { method: "POST", query: { id: "seed-req04" } },
  ],
  ["POST cancel", api.cancel, { method: "POST", query: { id: "seed-req04" } }],
  [
    "POST tip",
    api.tip,
    { query: { id: "seed-t03" }, ...keyed({ amount: 100 }) },
  ],
];

describe("write protections", () => {
  it("rejects every new write with 403 read_only in READ_ONLY mode", async () => {
    vi.stubEnv("READ_ONLY", "true");
    for (const [name, handler, request] of writes()) {
      expectError(await call(handler, request), 403, "read_only", name);
    }
    expect((await call(api.wallet)).statusCode).toBe(200);
    expect(
      (await call(api.request, { query: { id: "seed-req03" } })).body.request
        .status
    ).toBe("pending");
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

  it("limits money operations per user (429 with Retry-After)", async () => {
    for (let i = 0; i < 12; i++) {
      expect((await send({})).statusCode, `send ${i + 1}`).toBe(201);
    }

    const limited = await send({});
    expectError(limited, 429, "rate_limited");
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
    // One bucket for every kind of money operation (F's seed asks the demo
    // user to pay seed-req03).
    const others: [string, MockResponse][] = [
      ["top-up", await call(api.topUps, keyed({ amount: 2_500 }))],
      [
        "tip",
        await call(api.tip, {
          query: { id: "seed-t03" },
          ...keyed({ amount: 200 }),
        }),
      ],
      [
        "request",
        await call(api.requests, keyed({ from: "sarahcodes", amount: 450 })),
      ],
      ["pay", await call(api.pay, keyedNoBody({ id: "seed-req03" }))],
    ];
    for (const [label, res] of others) {
      expectError(res, 429, "rate_limited", label);
      expect(Number(res.headers["retry-after"]), label).toBeGreaterThan(0);
    }
    // Rejected requests don't use the budget, and other users have their own.
    expectInvalid(await send({ amount: 0 }), "amount");
    actAs("sarahcodes");
    expect(
      (await call(api.transfers, keyed({ to: "illlhanozkan", amount: 50 })))
        .statusCode
    ).toBe(201);
  });

  it("lifts the per-user limits with WRITE_RATE_LIMIT=0", async () => {
    vi.stubEnv("WRITE_RATE_LIMIT", "0");
    for (let i = 0; i < 13; i++) {
      expect((await send({})).statusCode, `send ${i + 1}`).toBe(201);
    }
  });

  it("parses bodies only on routes that take one", async () => {
    const config = async (path: string) => {
      const specifier = "../../" + path;
      return (await import(specifier)).config;
    };

    const withBody = [
      ROUTES.transfers,
      ROUTES.topUps,
      ROUTES.requests,
      ROUTES.tip,
      ROUTES.tweets,
    ];
    for (const path of withBody) {
      expect(await config(path), path).toEqual({
        api: { bodyParser: { sizeLimit: "16kb" } },
      });
    }

    const withoutBody = [
      ROUTES.wallet,
      ROUTES.activity,
      ROUTES.transfer,
      ROUTES.request,
      ROUTES.pay,
      ROUTES.decline,
      ROUTES.cancel,
      ROUTES.users,
      ROUTES.shellActivity,
      ROUTES.places,
    ];
    for (const path of withoutBody) {
      expect(await config(path), path).toEqual({
        api: { bodyParser: false },
      });
    }
  });
});

describe("feature gating", () => {
  it("turns the wallet routes into 404s with DISABLED_FEATURES=wallet", async () => {
    vi.stubEnv("DISABLED_FEATURES", "wallet");

    const reads: [string, Handler, MockRequest][] = [
      ["GET wallet", api.wallet, {}],
      ["GET activity", api.activity, {}],
      ["GET transfer", api.transfer, { query: { id: "seed-tx01" } }],
      ["GET requests", api.requests, { query: { role: "incoming" } }],
      ["GET request", api.request, { query: { id: "seed-req03" } }],
    ];
    for (const [name, handler, request] of [...reads, ...writes()]) {
      const res = await call(handler, request);
      expectError(res, 404, "not_found", name);
      expect(res.body.error.message, name).toBe("This feature is turned off");
    }

    expect((await call(api.me)).body.features.wallet).toBe(false);
    // Tweets stay, without tip data.
    const tweet = (await call(api.tweet, { query: { id: "seed-t03" } })).body
      .tweet;
    expect(tweet.stats.tips).toBe(0);
    expect(tweet.viewer.tipped).toBe(false);
  });

  it("answers 503 while the data source can't serve the wallet", async () => {
    vi.stubEnv("DATA_SOURCE", "sanity");
    vi.stubEnv("SANITY_PROJECT_ID", "testproject");
    vi.stubEnv("SANITY_API_TOKEN", "");

    for (const [name, handler, request] of [
      ["GET wallet", api.wallet, {}],
      ...writes(),
    ] as [string, Handler, MockRequest][]) {
      const res = await call(handler, request);
      expectError(res, 503, "service_unavailable", name);
      expect(res.body.error.message, name).toBe(
        "Wallet needs SANITY_API_TOKEN on this deployment"
      );
    }
  });
});

describe("GET /api/me", () => {
  it("reports the features that are on and the businesses the user runs", async () => {
    const { features, managedBusinesses } = (await call(api.me)).body;

    expect(Object.keys(features).sort()).toEqual([
      "channels",
      "messages",
      "orders",
      "rides",
      "shop",
      "stories",
      "wallet",
    ]);
    expect(features.wallet).toBe(true);
    // F's seed: the demo user manages @superapp.
    expect(managedBusinesses).toContain("superapp");

    actAs("kizilaykahve");
    expect((await call(api.me)).body.managedBusinesses).toContain(
      "kizilaykahve"
    );
  });
});

describe("GET /api/activity", () => {
  it("counts new notifications and reports live activity", async () => {
    const res = await call(api.shellActivity);

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(Math.abs(Date.parse(res.body.serverNow) - Date.now())).toBeLessThan(
      5_000
    );
    expect(res.body.newNotifications).toBeGreaterThan(0);
    expect(res.body.newNotifications).toBeLessThanOrEqual(99);
    expect(typeof res.body.unreadConversations).toBe("number");
    expect(Array.isArray(res.body.live)).toBe(true);

    const future = await call(api.shellActivity, {
      query: { since: "2999-01-01T00:00:00.000Z" },
    });
    expect(future.body.newNotifications).toBe(0);
  });

  it("counts a tip that arrived after `since`", async () => {
    const since = new Date(Date.now() - 1).toISOString();
    actAs("sarahcodes");
    const tip = await call(api.tip, {
      query: { id: "seed-t05" },
      ...keyed({ amount: 100 }),
    });
    expect(tip.statusCode).toBe(201);

    actAs("illlhanozkan");
    const res = await call(api.shellActivity, { query: { since } });
    expect(res.body.newNotifications).toBe(1);
  });

  it("reads nothing from features that are off", async () => {
    vi.stubEnv(
      "DISABLED_FEATURES",
      "messages,channels,shop,orders,rides,stories"
    );
    const res = await call(api.shellActivity);
    expect(res.body).toMatchObject({ unreadConversations: 0, live: [] });
  });

  it("validates `since`", async () => {
    for (const since of ["yesterday", "2026-13-01T00:00:00Z", ["a", "b"]]) {
      expectInvalid(
        await call(api.shellActivity, { query: { since } }),
        "since",
        String(since)
      );
    }
  });
});

describe("GET /api/notifications", () => {
  it("includes the wallet's notifications", async () => {
    const { items } = (
      await call(api.notifications, { query: { limit: "50" } })
    ).body;
    const ids = items.map((item: { id: string }) => item.id);

    // F's seed: Sarah tipped the demo user's Tweet; Marco sent 15.00.
    expect(ids).toEqual(
      expect.arrayContaining(["tip-seed-tx02", "pay-seed-tx03"])
    );
    expect(
      items.find((item: { id: string }) => item.id === "pay-seed-tx03")
    ).toMatchObject({
      type: "payment",
      amount: 1_500,
      actor: { username: "devmarco" },
    });
  });
});

describe("GET /api/users", () => {
  it("finds people by username or name", async () => {
    const res = await call(api.users, { query: { q: "sarah" } });

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.body.items[0]).toMatchObject({
      username: "sarahcodes",
      fullname: "Sarah Chen",
      accountType: "personal",
    });

    const business = await call(api.users, { query: { q: "Kahve" } });
    expect(business.body.items).toContainEqual(
      expect.objectContaining({
        username: "kizilaykahve",
        accountType: "business",
      })
    );

    const limited = await call(api.users, { query: { q: "a", limit: "1" } });
    expect(limited.body.items).toHaveLength(1);
  });

  it("validates the query", async () => {
    const queries: Record<string, string | string[]>[] = [
      {},
      { q: "   " },
      { q: "x".repeat(51) },
      { q: ["a", "b"] },
      { q: "a", limit: "0" },
      { q: "a", limit: "21" },
      { q: "a", limit: "two" },
    ];
    for (const query of queries) {
      const res = await call(api.users, { query });
      expect(res.statusCode, JSON.stringify(query)).toBe(400);
    }
  });
});

describe("GET /api/places", () => {
  it("lists the places anyone may cache", async () => {
    const res = await call(api.places);

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");
    expect(res.body.items).toHaveLength(11);
    expect(res.body.items[0]).toEqual({
      id: "kizilay",
      name: "Kızılay",
      area: "Çankaya",
      lat: 39.9208,
      lng: 32.8541,
    });
  });
});

describe("POST /api/tweets with an attachment", () => {
  it("refuses product attachments while the shop is off", async () => {
    vi.stubEnv("DISABLED_FEATURES", "shop");

    const res = await call(api.tweets, {
      method: "POST",
      ...json({
        text: "Try the latte",
        attachment: { type: "product", productId: "seed-p-kk-latte" },
      }),
    });
    expectError(res, 400, "validation_error");
    expect(res.body.error.details).toEqual([
      {
        path: "attachment",
        message: "Products can't be attached on this site",
      },
    ]);

    const plain = await call(api.tweets, {
      method: "POST",
      ...json({ text: "No attachment", attachment: null }),
    });
    expect(plain.statusCode).toBe(201);
    expect(plain.body.tweet).toMatchObject({
      attachment: null,
      stats: { tips: 0 },
      viewer: { tipped: false },
    });
  });

  it("validates the attachment's shape", async () => {
    for (const attachment of [
      { type: "link", productId: "seed-p-kk-latte" },
      { type: "product", productId: "private.seed-p-kk-latte" },
      "seed-p-kk-latte",
    ]) {
      const res = await call(api.tweets, {
        method: "POST",
        ...json({ text: "hi", attachment }),
      });
      expect(res.statusCode, JSON.stringify(attachment)).toBe(400);
      expect(res.body.error.details[0].path).toMatch(/^attachment/);
    }
  });
});
