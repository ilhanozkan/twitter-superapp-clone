import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MemoryState } from "../../lib/db/memory";
import { IRide } from "../../types/Ride";
import { IWallet } from "../../types/Wallet";
import { call, freshApi, json, MockRequest, MockResponse } from "../api";

// The rides endpoints on a fresh superapp-world memory store. Other lanes
// add seed data to this world, so these tests assert deltas and the rides
// lane's own seed records (drivers, seed-ride01), never whole-world totals.

const ROUTES = {
  quote: "pages/api/rides/quote",
  rides: "pages/api/rides/index",
  ride: "pages/api/rides/[id]/index",
  cancel: "pages/api/rides/[id]/cancel",
  tip: "pages/api/rides/[id]/tip",
  wallet: "pages/api/wallet/index",
  me: "pages/api/me",
  activity: "pages/api/activity",
  notifications: "pages/api/notifications",
  transfers: "pages/api/wallet/transfers/index",
} as const;

type Handler = Parameters<typeof call>[0];
let api: Record<keyof typeof ROUTES, Handler>;

let keyCount = 0;
const newKey = () => `ride-key-${String(++keyCount).padStart(6, "0")}`;

/** A keyed JSON write. */
const keyed = (
  body: unknown,
  key = newKey(),
  headers: Record<string, string> = {}
): MockRequest => ({
  method: "POST",
  ...json(body, { "idempotency-key": key, ...headers }),
});

/** Kızılay → Atakule, 5.1 km: economy 6.30, comfort 8.90, xl 11.10. */
const FARES = { economy: 630, comfort: 890, xl: 1110 } as const;
const trip = (type: keyof typeof FARES = "economy", fields = {}) => ({
  from: "kizilay",
  to: "atakule",
  type,
  expectedFare: FARES[type],
  ...fields,
});

const state = () =>
  (globalThis as { __superappMemoryState?: MemoryState })
    .__superappMemoryState!;

const actAs = (username: string) => vi.stubEnv("DEMO_USERNAME", username);

/** Moves the server's clock (the memory store reads `new Date()`). */
const setClock = (iso: string, ms = 0) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.parse(iso) + ms);
};

async function myWallet(): Promise<IWallet> {
  const res = await call(api.wallet);
  expect(res.statusCode).toBe(200);
  return res.body.wallet;
}

async function book(type: keyof typeof FARES = "economy", key?: string) {
  const res = await call(api.rides, keyed(trip(type), key));
  expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
  return res.body.ride as IRide;
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

describe("GET /api/rides/quote", () => {
  it("prices every type upfront and lets shared caches keep it a minute", async () => {
    const res = await call(api.quote, {
      query: { from: "kizilay", to: "atakule" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, s-maxage=60");
    expect(res.body.distanceKm).toBe(5.1);
    expect(res.body.tripMinutes).toBe(8);
    expect(
      res.body.quotes.map(
        ({ type, fare, available }: Record<string, unknown>) => [
          type,
          fare,
          available,
        ]
      )
    ).toEqual([
      ["economy", 630, true],
      ["comfort", 890, true],
      ["xl", 1110, true],
    ]);
  });

  it("marks a type unavailable while its only driver is booked", async () => {
    await book("comfort");
    const res = await call(api.quote, {
      query: { from: "bahcelievler", to: "atakule" },
    });
    expect(res.body.quotes[1]).toEqual({
      type: "comfort",
      label: "Comfort",
      seats: 4,
      fare: 1040,
      pickupMinutes: null,
      available: false,
    });
  });

  it("validates both places", async () => {
    expectInvalid(
      await call(api.quote, { query: { from: "kizilay", to: "kizilay" } }),
      "to",
      "same place"
    );
    expectInvalid(
      await call(api.quote, { query: { from: "moon", to: "atakule" } }),
      "from",
      "unknown pickup"
    );
    expectInvalid(
      await call(api.quote, { query: { from: "kizilay" } }),
      "to",
      "missing destination"
    );
    expectInvalid(
      await call(api.quote, {
        query: { from: ["kizilay", "ulus"], to: "atakule" },
      }),
      "from",
      "repeated"
    );
  });
});

describe("POST /api/rides", () => {
  it("books as the current user and pays the fare upfront", async () => {
    const before = await myWallet();
    const res = await call(api.rides, keyed(trip()));

    expect(res.statusCode).toBe(201);
    expect(res.headers["idempotent-replayed"]).toBeUndefined();
    const ride: IRide = res.body.ride;
    expect(ride.id).toMatch(/^ride-[0-9a-f]{32}$/);
    expect(res.headers.location).toBe(`/api/rides/${ride.id}`);
    expect(ride).toMatchObject({
      rider: { username: "illlhanozkan", fullname: "Ilhan Ozkan" },
      from: { id: "kizilay" },
      to: { id: "atakule" },
      type: "economy",
      fare: 630,
      status: "finding",
      canCancel: true,
    });
    expect(["ahmet_drives", "elif_rides"]).toContain(ride.driver.username);
    expect(res.body.wallet.balance).toBe(before.balance - 630);
    expect(await myWallet()).toEqual(res.body.wallet);
    expect(Math.abs(Date.parse(res.body.serverNow) - Date.now())).toBeLessThan(
      5_000
    );
  });

  it("replays a retried booking once and refuses a reused key", async () => {
    const first = await call(api.rides, keyed(trip(), "same-ride-key"));
    const again = await call(api.rides, keyed(trip(), "same-ride-key"));

    expect(again.statusCode).toBe(201);
    expect(again.headers["idempotent-replayed"]).toBe("true");
    expect(again.body.ride.id).toBe(first.body.ride.id);
    expect(again.body.wallet.balance).toBe(first.body.wallet.balance);

    expectError(
      await call(api.rides, keyed(trip("xl"), "same-ride-key")),
      422,
      "idempotency_key_reused"
    );
  });

  it("validates the places, the type, the fare and the key", async () => {
    const cases: [string, Record<string, unknown>, string][] = [
      ["same place", { to: "kizilay" }, "to"],
      ["unknown place", { from: "moon" }, "from"],
      ["unknown type", { type: "limo" }, "type"],
      ["missing type", { type: undefined }, "type"],
      ["float fare", { expectedFare: 630.5 }, "expectedFare"],
      ["string fare", { expectedFare: "630" }, "expectedFare"],
      ["zero fare", { expectedFare: 0 }, "expectedFare"],
      ["negative fare", { expectedFare: -630 }, "expectedFare"],
      ["huge fare", { expectedFare: 20_001 }, "expectedFare"],
    ];
    for (const [label, fields, path] of cases) {
      expectInvalid(
        await call(api.rides, keyed(trip("economy", fields))),
        path,
        label
      );
    }

    expectInvalid(
      await call(api.rides, { method: "POST", ...json(trip()) }),
      "Idempotency-Key",
      "missing key"
    );
    expectInvalid(
      await call(api.rides, keyed(trip(), "short")),
      "Idempotency-Key",
      "short key"
    );
    // Nothing was booked.
    expect(state().rides.rides.size).toBe(1);
  });

  it("answers 409 price_changed when the quoted fare is out of date", async () => {
    const res = await call(
      api.rides,
      keyed(trip("economy", { expectedFare: 600 }))
    );
    expectError(res, 409, "price_changed");
    expect(res.body.error.message).toBe(
      "The fare changed. Check the new price and book again."
    );
  });

  it("answers 409 invalid_state while the rider has a ride in progress", async () => {
    await book();
    const res = await call(api.rides, keyed(trip("xl")));
    expectError(res, 409, "invalid_state");
    expect(res.body.error.message).toMatch(/already have a ride in progress/);
  });

  it("answers 422 unavailable when no driver of the type is free", async () => {
    await book("comfort");
    actAs("sarahcodes");
    const res = await call(api.rides, keyed(trip("comfort")));
    expectError(res, 422, "unavailable");
    expect(res.body.error.message).toBe(
      "No Comfort drivers are free nearby. Try another ride type."
    );
  });

  it("answers 402 and 403 wallet_frozen with the shared envelopes", async () => {
    // Someone who never received credits.
    actAs("newcomer");
    const broke = await call(api.rides, keyed(trip()));
    expectError(broke, 402, "insufficient_funds");

    actAs("sarahcodes");
    state().wallet.frozen.add("sarahcodes");
    expectError(await call(api.rides, keyed(trip())), 403, "wallet_frozen");
  });

  it("ignores identity fields in the body", async () => {
    const res = await call(
      api.rides,
      keyed({
        ...trip(),
        rider: "mallory",
        username: "mallory",
        from_user: "mallory",
        driver: "mallory",
      })
    );
    expect(res.statusCode).toBe(201);
    expect(res.body.ride.rider.username).toBe("illlhanozkan");
    expect(res.body.ride.driver.username).not.toBe("mallory");
  });
});

describe("GET /api/rides", () => {
  it("lists the current user's trips as the rider, newest first", async () => {
    const ride = await book();
    const res = await call(api.rides);

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.body.items.map((r: IRide) => r.id).slice(0, 2)).toEqual([
      ride.id,
      "seed-ride01",
    ]);
    expect(typeof res.body.serverNow).toBe("string");

    const page = await call(api.rides, { query: { limit: "1" } });
    expect(page.body.items).toHaveLength(1);
    const next = await call(api.rides, {
      query: { limit: "1", cursor: page.body.nextCursor },
    });
    expect(next.body.items[0].id).toBe("seed-ride01");
  });

  it("lists the trips a driver drove, read-only", async () => {
    actAs("ahmet_drives");
    const driven = await call(api.rides, { query: { as: "driver" } });
    expect(driven.body.items.map((r: IRide) => r.id)).toEqual(["seed-ride01"]);
    expect((await call(api.rides)).body.items).toEqual([]);
  });

  it("validates the query", async () => {
    expectInvalid(await call(api.rides, { query: { as: "admin" } }), "as");
    expectInvalid(await call(api.rides, { query: { limit: "0" } }), "limit");
    expectInvalid(
      await call(api.rides, { query: { cursor: "nope" } }),
      "cursor"
    );
  });
});

describe("GET /api/rides/:id", () => {
  it("shows a ride to its rider and its driver, 404 to everyone else", async () => {
    const mine = await call(api.ride, { query: { id: "seed-ride01" } });
    expect(mine.statusCode).toBe(200);
    expect(mine.headers["cache-control"]).toBe("private, no-store");
    expect(mine.body.ride).toMatchObject({
      id: "seed-ride01",
      status: "completed",
      fare: 740,
      driver: { username: "ahmet_drives" },
    });
    expect(typeof mine.body.serverNow).toBe("string");

    actAs("ahmet_drives");
    expect(
      (await call(api.ride, { query: { id: "seed-ride01" } })).statusCode
    ).toBe(200);

    actAs("sarahcodes");
    expectError(
      await call(api.ride, { query: { id: "seed-ride01" } }),
      404,
      "not_found"
    );
    for (const id of ["ride-missing", "private.seed-ride01", "../x"]) {
      expectError(
        await call(api.ride, { query: { id } }),
        404,
        "not_found",
        id
      );
    }
  });

  it("derives the status from the server's clock", async () => {
    const ride = await book("xl");
    setClock(ride.pickupAt, 1_000);
    const res = await call(api.ride, { query: { id: ride.id } });
    expect(res.body.ride).toMatchObject({
      status: "on_trip",
      canCancel: false,
    });
    expect(res.body.serverNow).toBe(
      new Date(Date.parse(ride.pickupAt) + 1_000).toISOString()
    );
  });
});

describe("POST /api/rides/:id/cancel", () => {
  const cancel = (id: string) =>
    call(api.cancel, { method: "POST", query: { id } });

  it("refunds the fare before pickup, idempotently", async () => {
    const before = await myWallet();
    const ride = await book();

    const res = await cancel(ride.id);
    expect(res.statusCode).toBe(200);
    expect(res.body.ride).toMatchObject({
      id: ride.id,
      status: "cancelled",
      refundTransferId: `refund-${ride.paymentTransferId}`,
    });
    expect(res.body.wallet.balance).toBe(before.balance);
    expect(typeof res.body.serverNow).toBe("string");

    const again = await cancel(ride.id);
    expect(again.statusCode).toBe(200);
    expect(again.body.ride.cancelledAt).toBe(res.body.ride.cancelledAt);
    expect(again.body.wallet.balance).toBe(before.balance);
  });

  it("answers 409 invalid_state at pickup and after", async () => {
    const ride = await book();
    setClock(ride.pickupAt);
    expectError(await cancel(ride.id), 409, "invalid_state");
    setClock(ride.dropoffAt, 1_000);
    expectError(await cancel(ride.id), 409, "invalid_state");
  });

  it("lets only the rider cancel: 403 for the driver, 404 for others", async () => {
    const ride = await book();
    actAs(ride.driver.username);
    expectError(await cancel(ride.id), 403, "forbidden");
    actAs("sarahcodes");
    expectError(await cancel(ride.id), 404, "not_found");
    expectError(await cancel("ride-missing"), 404, "not_found");

    actAs("illlhanozkan");
    const res = await call(api.ride, { query: { id: ride.id } });
    expect(res.body.ride.status).not.toBe("cancelled");
  });
});

describe("POST /api/rides/:id/tip", () => {
  const tip = (id: string, amount: unknown = 200, key?: string) =>
    call(api.tip, { query: { id }, ...keyed({ amount }, key) });

  it("answers 409 invalid_state before the ride is complete", async () => {
    const ride = await book();
    const res = await tip(ride.id);
    expectError(res, 409, "invalid_state");
    expect(res.body.error.message).toBe(
      "You can tip your driver once the ride is complete"
    );
    setClock(ride.pickupAt);
    expectError(await tip(ride.id), 409, "invalid_state", "on the trip");
  });

  it("tips the driver once the ride is complete, replaying a retry", async () => {
    const ride = await book();
    setClock(ride.dropoffAt, 1_000);
    const before = await myWallet();

    const res = await tip(ride.id, 200, "ride-tip-key-1");
    expect(res.statusCode).toBe(201);
    expect(res.body.transfer).toMatchObject({
      kind: "tip",
      amount: 200,
      from: { username: "illlhanozkan" },
      to: { username: ride.driver.username },
      context: { type: "ride", id: ride.id, code: ride.code },
    });
    expect(res.headers.location).toBe(
      `/api/wallet/transfers/${res.body.transfer.id}`
    );
    expect(res.body.wallet.balance).toBe(before.balance - 200);

    const again = await tip(ride.id, 200, "ride-tip-key-1");
    expect(again.statusCode).toBe(201);
    expect(again.headers["idempotent-replayed"]).toBe("true");
    expect(again.body.transfer.id).toBe(res.body.transfer.id);
    expect((await myWallet()).balance).toBe(before.balance - 200);

    expectError(
      await tip(ride.id, 500, "ride-tip-key-1"),
      422,
      "idempotency_key_reused"
    );
  });

  it("validates the amount and the key", async () => {
    for (const amount of [0, 49, 5_001, 1.5, "200", null]) {
      expectInvalid(await tip("seed-ride01", amount), "amount", String(amount));
    }
    expectInvalid(
      await call(api.tip, {
        method: "POST",
        query: { id: "seed-ride01" },
        ...json({ amount: 200 }),
      }),
      "Idempotency-Key"
    );
  });

  it("lets only the rider tip: 403 for the driver, 404 for others", async () => {
    actAs("ahmet_drives");
    expectError(await tip("seed-ride01"), 403, "forbidden");
    actAs("sarahcodes");
    expectError(await tip("seed-ride01"), 404, "not_found");
    actAs("illlhanozkan");
    expectError(await tip("ride-missing"), 404, "not_found");
    expect((await tip("seed-ride01")).statusCode).toBe(201);
  });
});

describe("the rest of the app", () => {
  it("reports rides on, shows the trip as live activity and notifies on completion", async () => {
    expect((await call(api.me)).body.features.rides).toBe(true);
    const ride = await book();

    const live = (await call(api.activity)).body.live;
    expect(live).toContainEqual(
      expect.objectContaining({
        kind: "ride",
        id: ride.id,
        title: "Ride to Atakule",
      })
    );

    const ids = async () =>
      (await call(api.notifications)).body.items.map(
        (n: { id: string }) => n.id
      );
    expect(await ids()).toContain("ride-completed-seed-ride01");
    expect(await ids()).not.toContain(`ride-completed-${ride.id}`);
    setClock(ride.dropoffAt);
    expect(await ids()).toContain(`ride-completed-${ride.id}`);
  });
});

/** Every rides write, ready to call (fresh keys each time). */
const writes = (): [string, Handler, MockRequest][] => [
  ["POST rides", api.rides, keyed(trip())],
  ["POST cancel", api.cancel, { method: "POST", query: { id: "seed-ride01" } }],
  [
    "POST tip",
    api.tip,
    { query: { id: "seed-ride01" }, ...keyed({ amount: 100 }) },
  ],
];

describe("write protections", () => {
  it("rejects every write with 403 read_only in READ_ONLY mode", async () => {
    vi.stubEnv("READ_ONLY", "true");
    for (const [name, handler, request] of writes()) {
      expectError(await call(handler, request), 403, "read_only", name);
    }
    expect(
      (await call(api.quote, { query: { from: "kizilay", to: "ulus" } }))
        .statusCode
    ).toBe(200);
    expect(state().rides.rides.size).toBe(1);
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

  it("counts bookings and tips against the per-user money budget", async () => {
    const ride = await book();
    for (let i = 0; i < 11; i++) {
      const res = await call(
        api.transfers,
        keyed({ to: "sarahcodes", amount: 50 })
      );
      expect(res.statusCode, `send ${i + 1}`).toBe(201);
    }

    const booking = await call(api.rides, keyed(trip("xl")));
    expectError(booking, 429, "rate_limited", "book");
    expect(Number(booking.headers["retry-after"])).toBeGreaterThan(0);
    expectError(
      await call(api.tip, {
        query: { id: "seed-ride01" },
        ...keyed({ amount: 100 }),
      }),
      429,
      "rate_limited",
      "tip"
    );
    // Cancelling only gives credits back, so it takes no budget.
    const cancelled = await call(api.cancel, {
      method: "POST",
      query: { id: ride.id },
    });
    expect(cancelled.statusCode).toBe(200);
  });

  it("parses bodies only on routes that take one", async () => {
    const config = async (path: string) => {
      const specifier = "../../" + path;
      return (await import(specifier)).config;
    };
    for (const path of [ROUTES.rides, ROUTES.tip]) {
      expect(await config(path), path).toEqual({
        api: { bodyParser: { sizeLimit: "16kb" } },
      });
    }
    for (const path of [ROUTES.quote, ROUTES.ride, ROUTES.cancel]) {
      expect(await config(path), path).toEqual({ api: { bodyParser: false } });
    }
  });
});

describe("feature gating", () => {
  const reads = (): [string, Handler, MockRequest][] => [
    ["GET quote", api.quote, { query: { from: "kizilay", to: "atakule" } }],
    ["GET rides", api.rides, {}],
    ["GET ride", api.ride, { query: { id: "seed-ride01" } }],
  ];

  it("turns the rides routes into 404s with DISABLED_FEATURES=rides", async () => {
    vi.stubEnv("DISABLED_FEATURES", "rides");
    for (const [name, handler, request] of [...reads(), ...writes()]) {
      const res = await call(handler, request);
      expectError(res, 404, "not_found", name);
      expect(res.body.error.message, name).toBe("This feature is turned off");
    }
    expect((await call(api.me)).body.features.rides).toBe(false);
    const ids = (await call(api.notifications)).body.items.map(
      (n: { id: string }) => n.id
    );
    expect(ids).not.toContain("ride-completed-seed-ride01");
  });

  it("answers 503 while the data source can't serve rides", async () => {
    vi.stubEnv("DATA_SOURCE", "sanity");
    vi.stubEnv("SANITY_PROJECT_ID", "testproject");
    vi.stubEnv("SANITY_API_TOKEN", "");
    for (const [name, handler, request] of [...reads(), ...writes()]) {
      const res = await call(handler, request);
      expectError(res, 503, "service_unavailable", name);
      expect(res.body.error.message, name).toBe(
        "Rides needs SANITY_API_TOKEN on this deployment"
      );
    }
  });
});
