import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MemoryState } from "../../lib/db/memory";
import { IProduct } from "../../types/Shop";
import { call, freshApi, json, MockRequest, MockResponse } from "../api";

// The business and product endpoints on a fresh superapp-world memory
// store. They assert only C1's own seed records (menus, products, product
// Tweets) and F's businesses, never whole-world totals.

const ROUTES = {
  businesses: "pages/api/businesses/index",
  business: "pages/api/businesses/[username]/index",
  settings: "pages/api/businesses/[username]/settings",
  product: "pages/api/products/[id]/index",
  availability: "pages/api/products/[id]/availability",
  attachable: "pages/api/products/attachable",
  tweets: "pages/api/tweets/index",
  tweet: "pages/api/tweets/[id]/index",
  me: "pages/api/me",
} as const;

type Handler = Parameters<typeof call>[0];
let api: Record<keyof typeof ROUTES, Handler>;

const state = () =>
  (globalThis as { __superappMemoryState?: MemoryState })
    .__superappMemoryState!;

const actAs = (username: string) => vi.stubEnv("DEMO_USERNAME", username);

const put = (query: Record<string, string>, body: unknown): MockRequest => ({
  method: "PUT",
  query,
  ...json(body),
});

const setSettings = (username: string, body: unknown) =>
  call(api.settings, put({ username }, body));

const setAvailability = (id: string, body: unknown) =>
  call(api.availability, put({ id }, body));

const postTweet = (productId: string) =>
  call(api.tweets, {
    method: "POST",
    ...json({
      text: "Order it right from this Tweet",
      attachment: { type: "product", productId },
    }),
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
  expect(res.body.error.details[0].path, label).toBe(path);
}

const ids = (items: IProduct[]) => items.map((item) => item.id);

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

describe("GET /api/businesses", () => {
  it("lists every business with its status and highlights, cacheable briefly", async () => {
    const res = await call(api.businesses);

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, s-maxage=30");
    const usernames = res.body.items.map(
      (item: { username: string }) => item.username
    );
    expect(usernames).toEqual(
      expect.arrayContaining([
        "bowlandco",
        "kizilaykahve",
        "lahmacunlab",
        "superapp",
      ])
    );
    expect(
      res.body.items.find(
        (item: { username: string }) => item.username === "kizilaykahve"
      )
    ).toMatchObject({
      fullname: "Kızılay Kahve",
      category: "cafe",
      deliveryFee: 150,
      etaMinutes: [9, 12],
      status: { orderable: true, label: "Open 24 hours" },
      highlights: ["Türk kahvesi", "Pistachio latte", "Cold brew"],
    });
  });

  it("filters by category", async () => {
    const res = await call(api.businesses, { query: { category: "healthy" } });
    expect(
      res.body.items.map((item: { username: string }) => item.username)
    ).toEqual(["bowlandco"]);
  });

  it("validates the category", async () => {
    for (const category of ["Cafe", "bars", "", ["cafe", "shop"]]) {
      const res = await call(api.businesses, { query: { category } });
      expectInvalid(res, "category", JSON.stringify(category));
    }
  });
});

describe("GET /api/businesses/:username", () => {
  it("returns the business with its menu", async () => {
    const res = await call(api.business, {
      query: { username: "KizilayKahve" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.body.business).toMatchObject({
      username: "kizilaykahve",
      acceptingOrders: true,
      status: { label: "Open 24 hours" },
    });
    expect(
      res.body.menu.map(
        ({ title, products }: { title: string; products: IProduct[] }) => [
          title,
          ids(products),
        ]
      )
    ).toEqual([
      [
        "Coffee",
        ["seed-p-kk-turkish", "seed-p-kk-latte", "seed-p-kk-coldbrew"],
      ],
      ["Bakery", ["seed-p-kk-simit", "seed-p-kk-cheesecake"]],
    ]);
  });

  it("404s for people, unknown accounts and invalid usernames", async () => {
    for (const username of ["sarahcodes", "ghost", "not-a-user", "a.b"]) {
      const res = await call(api.business, { query: { username } });
      expectError(res, 404, "not_found", username);
      expect(res.body.error.message, username).toBe("Business not found");
    }
  });
});

describe("PUT /api/businesses/:username/settings", () => {
  it("lets a manager pause and resume orders", async () => {
    // The demo user manages @superapp.
    const paused = await setSettings("superapp", { acceptingOrders: false });
    expect(paused.statusCode).toBe(200);
    expect(paused.headers["cache-control"]).toBe("no-store");
    expect(paused.body.business).toMatchObject({
      username: "superapp",
      acceptingOrders: false,
      status: { orderable: false, reason: "paused" },
    });

    // Every product card of the business follows.
    const card = (await call(api.product, { query: { id: "seed-p-sa-mug" } }))
      .body.card;
    expect(card.business.status.reason).toBe("paused");

    const resumed = await setSettings("superapp", { acceptingOrders: true });
    expect(resumed.body.business.status.orderable).toBe(true);
  });

  it("lets the business account itself switch it", async () => {
    actAs("kizilaykahve");
    const res = await setSettings("KizilayKahve", { acceptingOrders: false });
    expect(res.statusCode).toBe(200);
    expect(res.body.business.acceptingOrders).toBe(false);
  });

  it("404s for anyone who doesn't run the business", async () => {
    actAs("sarahcodes");
    for (const username of ["superapp", "kizilaykahve", "ghost"]) {
      const res = await setSettings(username, { acceptingOrders: false });
      expectError(res, 404, "not_found", username);
      expect(res.body.error.message).toBe("Business not found");
    }
    actAs("illlhanozkan");
    expectError(
      await setSettings("kizilaykahve", { acceptingOrders: false }),
      404,
      "not_found"
    );
    expect(
      (await call(api.business, { query: { username: "kizilaykahve" } })).body
        .business.acceptingOrders
    ).toBe(true);
  });

  it("validates the body and ignores identity fields", async () => {
    for (const body of [
      {},
      { acceptingOrders: "false" },
      { acceptingOrders: 0 },
    ]) {
      expectInvalid(
        await setSettings("superapp", body),
        "acceptingOrders",
        JSON.stringify(body)
      );
    }
    const res = await setSettings("superapp", {
      acceptingOrders: false,
      username: "kizilaykahve",
      managers: ["sarahcodes"],
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.business).toMatchObject({
      username: "superapp",
      managers: ["illlhanozkan"],
    });
  });
});

describe("GET /api/products/:id", () => {
  it("returns the product and its card", async () => {
    const res = await call(api.product, { query: { id: "seed-p-kk-latte" } });

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.body.product).toMatchObject({
      id: "seed-p-kk-latte",
      business: "kizilaykahve",
      section: "Coffee",
      name: "Pistachio latte",
      price: 500,
      available: true,
    });
    expect(res.body.card).toMatchObject({
      id: "seed-p-kk-latte",
      price: 500,
      imageAlt: res.body.product.imageAlt,
      business: { username: "kizilaykahve", etaMinutes: [9, 12] },
    });
  });

  it("404s for unknown ids and anything that isn't a key", async () => {
    for (const id of ["missing", "private.seed-p-kk-latte", "drafts.x"]) {
      const res = await call(api.product, { query: { id } });
      expectError(res, 404, "not_found", id);
      expect(res.body.error.message).toBe("Product not found");
    }
  });
});

describe("PUT /api/products/:id/availability", () => {
  it("lets a manager mark a product sold out and back", async () => {
    const soldOut = await setAvailability("seed-p-sa-mug", {
      available: false,
    });
    expect(soldOut.statusCode).toBe(200);
    expect(soldOut.body.product).toMatchObject({
      id: "seed-p-sa-mug",
      available: false,
    });
    expect(
      (await call(api.product, { query: { id: "seed-p-sa-mug" } })).body.card
        .available
    ).toBe(false);

    const back = await setAvailability("seed-p-sa-mug", { available: true });
    expect(back.body.product.available).toBe(true);
  });

  it("404s for anyone who doesn't run the product's business", async () => {
    actAs("sarahcodes");
    for (const id of ["seed-p-sa-mug", "seed-p-kk-latte", "missing"]) {
      const res = await setAvailability(id, { available: false });
      expectError(res, 404, "not_found", id);
      expect(res.body.error.message).toBe("Product not found");
    }
    expect(state().shop.products.get("seed-p-sa-mug")!.available).toBe(true);
  });

  it("validates the body", async () => {
    for (const body of [{}, { available: "no" }, { available: null }]) {
      expectInvalid(
        await setAvailability("seed-p-sa-mug", body),
        "available",
        JSON.stringify(body)
      );
    }
  });
});

describe("GET /api/products/attachable", () => {
  it("suggests the available products of the businesses the user runs", async () => {
    const res = await call(api.attachable);
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    // @superapp's sold-out hoodie isn't suggested.
    expect(ids(res.body.items)).toEqual([
      "seed-p-sa-stickers",
      "seed-p-sa-mug",
    ]);

    actAs("sarahcodes");
    expect((await call(api.attachable)).body.items).toEqual([]);
  });
});

describe("product cards on Tweets", () => {
  it("decorates seeded product Tweets", async () => {
    const res = await call(api.tweet, { query: { id: "seed-t22" } });
    expect(res.body.tweet.attachment).toMatchObject({
      type: "product",
      product: {
        id: "seed-p-kk-latte",
        name: "Pistachio latte",
        business: { username: "kizilaykahve", fullname: "Kızılay Kahve" },
      },
    });
  });

  it("posts a Tweet with any account's available product and returns the card", async () => {
    // Like sharing a link: Sarah runs no business but can attach the latte.
    actAs("sarahcodes");
    const res = await postTweet("seed-p-kk-latte");

    expect(res.statusCode).toBe(201);
    expect(res.body.tweet.attachment).toMatchObject({
      type: "product",
      product: { id: "seed-p-kk-latte", available: true },
    });
    const read = await call(api.tweet, { query: { id: res.body.tweet.id } });
    expect(read.body.tweet.attachment).toEqual(res.body.tweet.attachment);
  });

  it("refuses a sold-out product with 422 unavailable", async () => {
    const res = await postTweet("seed-p-sa-hoodie");

    expectError(res, 422, "unavailable");
    expect(res.body.error.message).toBe("Hoodie is sold out");
    expect(res.body.error.details).toEqual([
      { path: "productId", message: "seed-p-sa-hoodie" },
    ]);

    // Once a manager marks it sold out, the mug is refused too.
    await setAvailability("seed-p-sa-mug", { available: false });
    expectError(await postTweet("seed-p-sa-mug"), 422, "unavailable");
  });

  it("404s for an unknown product", async () => {
    const res = await postTweet("missing");
    expectError(res, 404, "not_found");
    expect(res.body.error.message).toBe("Product not found");
  });
});

describe("the shop's write rules", () => {
  const writes = (): [string, Handler, MockRequest][] => [
    [
      "settings",
      api.settings,
      put({ username: "superapp" }, { acceptingOrders: false }),
    ],
    [
      "availability",
      api.availability,
      put({ id: "seed-p-sa-mug" }, { available: false }),
    ],
  ];

  it("refuses writes on a read-only site", async () => {
    vi.stubEnv("READ_ONLY", "true");
    for (const [name, handler, request] of writes()) {
      expectError(await call(handler, request), 403, "read_only", name);
    }
    expect(state().shop.products.get("seed-p-sa-mug")!.available).toBe(true);
  });

  it("refuses cross-origin writes", async () => {
    for (const [name, handler, request] of writes()) {
      const res = await call(handler, {
        ...request,
        headers: { ...request.headers, origin: "https://evil.example" },
      });
      expectError(res, 403, "forbidden", name);
    }
  });

  it("only takes JSON bodies", async () => {
    for (const [name, handler, request] of writes()) {
      const res = await call(handler, {
        ...request,
        headers: { "content-type": "text/plain" },
      });
      expectError(res, 415, "unsupported_media_type", name);
    }
  });

  it("answers 405 for other methods", async () => {
    for (const [name, handler] of [
      ["businesses", api.businesses],
      ["business", api.business],
      ["product", api.product],
      ["attachable", api.attachable],
    ] as [string, Handler][]) {
      const res = await call(handler, { method: "POST" });
      expectError(res, 405, "method_not_allowed", name);
      expect(res.headers.allow, name).toBe("GET, HEAD, OPTIONS");
    }
    for (const [name, handler] of [
      ["settings", api.settings],
      ["availability", api.availability],
    ] as [string, Handler][]) {
      const res = await call(handler, { method: "GET" });
      expectError(res, 405, "method_not_allowed", name);
      expect(res.headers.allow, name).toBe("PUT, OPTIONS");
    }
  });

  it("parses bodies only on routes that take one", async () => {
    const config = async (path: string) => {
      const specifier = "../../" + path;
      return (await import(specifier)).config;
    };
    for (const path of [ROUTES.settings, ROUTES.availability]) {
      expect(await config(path), path).toEqual({
        api: { bodyParser: { sizeLimit: "16kb" } },
      });
    }
    for (const path of [
      ROUTES.businesses,
      ROUTES.business,
      ROUTES.product,
      ROUTES.attachable,
    ]) {
      expect(await config(path), path).toEqual({ api: { bodyParser: false } });
    }
  });
});

describe("feature gating", () => {
  it("turns every shop route into a 404 with DISABLED_FEATURES=shop", async () => {
    vi.stubEnv("DISABLED_FEATURES", "shop");

    for (const [name, handler, request] of [
      ["businesses", api.businesses, {}],
      ["business", api.business, { query: { username: "kizilaykahve" } }],
      ["product", api.product, { query: { id: "seed-p-kk-latte" } }],
      ["attachable", api.attachable, {}],
      [
        "settings",
        api.settings,
        put({ username: "superapp" }, { acceptingOrders: false }),
      ],
      [
        "availability",
        api.availability,
        put({ id: "seed-p-sa-mug" }, { available: false }),
      ],
    ] as [string, Handler, MockRequest][]) {
      const res = await call(handler, request);
      expectError(res, 404, "not_found", name);
      expect(res.body.error.message, name).toBe("This feature is turned off");
    }

    expect((await call(api.me)).body.features.shop).toBe(false);
    // Tweets stay, without their product cards.
    expect(
      (await call(api.tweet, { query: { id: "seed-t22" } })).body.tweet
        .attachment
    ).toBeNull();
    expect(state().business.profiles.get("superapp")!.acceptingOrders).toBe(
      true
    );
  });

  it("reports the shop as on", async () => {
    expect((await call(api.me)).body.features.shop).toBe(true);
  });
});
