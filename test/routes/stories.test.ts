import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MemoryState } from "../../lib/db/memory";
import { IStory } from "../../types/Story";
import { call, freshApi, json, MockRequest, MockResponse } from "../api";

// /api/stories/** on a fresh superapp-world memory store. The stories seed
// is this lane's: six accounts, the demo user's seed-story07 seen by three
// people, and Lena's seed-story05 already seen by the demo user.

const ROUTES = {
  stories: "pages/api/stories/index",
  tray: "pages/api/stories/tray",
  views: "pages/api/stories/views",
  story: "pages/api/stories/[id]/index",
  viewers: "pages/api/stories/[id]/viewers",
  me: "pages/api/me",
} as const;

type Handler = Parameters<typeof call>[0];
let api: Record<keyof typeof ROUTES, Handler>;

const state = () =>
  (globalThis as { __superappMemoryState?: MemoryState })
    .__superappMemoryState!;

const actAs = (username: string) => vi.stubEnv("DEMO_USERNAME", username);

const post = (body: unknown, headers: Record<string, string> = {}) => ({
  method: "POST",
  ...json(body, headers),
});

const textStory = (text = "Hello stories 👋", background = "blue") => ({
  content: { type: "text", text, background },
});

async function postStory(body: unknown = textStory()): Promise<IStory> {
  const res = await call(api.stories, post(body));
  expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
  return res.body.story;
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
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /api/stories/tray", () => {
  it("lists your story, then unseen accounts, then seen ones", async () => {
    const res = await call(api.tray);

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(
      res.body.items.map(
        (item: { author: { username: string }; hasUnseen: boolean }) => [
          item.author.username,
          item.hasUnseen,
        ]
      )
    ).toEqual([
      ["illlhanozkan", true],
      ["superapp", true],
      ["foodie_ankara", true],
      ["kizilaykahve", true],
      ["sarahcodes", true],
      ["lenaframes", false],
    ]);
    expect(res.body.items[2]).toMatchObject({
      storyIds: ["seed-story03", "seed-story04"],
      firstUnseenId: "seed-story03",
      unseenIds: ["seed-story03", "seed-story04"],
    });
  });

  it("is the current user's", async () => {
    actAs("sarahcodes");
    const { items } = (await call(api.tray)).body;
    expect(items[0].author.username).toBe("sarahcodes");
  });
});

describe("GET /api/stories?author=", () => {
  it("lists the author's stories oldest first", async () => {
    const res = await call(api.stories, {
      query: { author: "Foodie_Ankara" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.body.items.map((story: IStory) => story.id)).toEqual([
      "seed-story03",
      "seed-story04",
    ]);
    expect(res.body.items[0]).toMatchObject({
      author: { username: "foodie_ankara", fullname: "Mert Demir" },
      content: { type: "image", alt: "A cup of Turkish coffee" },
      viewer: { seen: false },
      views: null,
    });
  });

  it("answers an empty list for people without stories, 404 for unknown ones", async () => {
    const empty = await call(api.stories, { query: { author: "devmarco" } });
    expect(empty.statusCode).toBe(200);
    expect(empty.body).toEqual({ items: [] });

    expectError(
      await call(api.stories, { query: { author: "ghost" } }),
      404,
      "not_found"
    );
  });

  it("validates the author", async () => {
    const queries: Record<string, string | string[]>[] = [
      {},
      { author: "" },
      { author: "not a user" },
      { author: "a".repeat(16) },
      { author: ["sarahcodes", "devmarco"] },
    ];
    for (const query of queries) {
      expectInvalid(
        await call(api.stories, { query }),
        "author",
        JSON.stringify(query)
      );
    }
  });
});

describe("POST /api/stories", () => {
  it("posts a text story as the current user", async () => {
    const res = await call(
      api.stories,
      post(textStory("  Shipping stories ✨\u0007 ", "purple"))
    );

    expect(res.statusCode).toBe(201);
    const story: IStory = res.body.story;
    expect(story).toMatchObject({
      author: { username: "illlhanozkan", fullname: "Ilhan Ozkan" },
      content: {
        type: "text",
        text: "Shipping stories ✨",
        background: "purple",
      },
      viewer: { seen: false },
      views: 0,
    });
    expect(story.id).toMatch(/^story-/);
    expect(Date.parse(story.expiresAt) - Date.parse(story.createdAt)).toBe(
      24 * 60 * 60 * 1000
    );
    expect(res.headers.location).toBe(`/api/stories/${story.id}`);

    const read = await call(api.story, { query: { id: story.id } });
    expect(read.statusCode).toBe(200);
    expect(read.body.story).toEqual(story);
    expect((await call(api.tray)).body.items[0].storyIds).toEqual([
      "seed-story07",
      story.id,
    ]);
  });

  it("posts an image story; a blank caption is stored as null", async () => {
    const story = await postStory({
      content: {
        type: "image",
        image: "https://example.com/sunset.jpg",
        alt: " A sunset over the bay ",
        caption: " \n ",
      },
    });
    expect(story.content).toEqual({
      type: "image",
      image: "https://example.com/sunset.jpg",
      alt: "A sunset over the bay",
      caption: null,
    });

    const withCaption = await postStory({
      content: {
        type: "image",
        image: "/media/stories/latte.svg",
        alt: "A latte",
        caption: "Today's special 🟢",
      },
    });
    expect(withCaption.content).toMatchObject({
      caption: "Today's special 🟢",
    });
  });

  it("validates the content", async () => {
    const image = (fields: Record<string, unknown>) => ({
      content: {
        type: "image",
        image: "/media/coffee.svg",
        alt: "Coffee",
        ...fields,
      },
    });
    const cases: [unknown, string][] = [
      [{}, "content"],
      [{ content: "hello" }, "content"],
      [{ content: { type: "video" } }, "content.type"],
      [{ content: { text: "no type", background: "blue" } }, "content.type"],
      [textStory(""), "content.text"],
      [textStory(" \n\t "), "content.text"],
      [textStory("x".repeat(201)), "content.text"],
      [textStory("hi", "red"), "content.background"],
      [{ content: { type: "text", text: "hi" } }, "content.background"],
      [image({ image: undefined }), "content.image"],
      [image({ image: "javascript:alert(1)" }), "content.image"],
      [image({ image: "//evil.example/x.png" }), "content.image"],
      [image({ image: "data:image/png;base64,AAAA" }), "content.image"],
      [image({ image: "http://example.com/x.png" }), "content.image"],
      [image({ alt: undefined }), "content.alt"],
      [image({ alt: "   " }), "content.alt"],
      [image({ alt: "x".repeat(421) }), "content.alt"],
      [image({ caption: "x".repeat(101) }), "content.caption"],
    ];
    for (const [body, path] of cases) {
      expectInvalid(
        await call(api.stories, post(body)),
        path,
        JSON.stringify(body)
      );
    }

    // Limits are in code points: 200 emoji fit.
    expect(
      (await call(api.stories, post(textStory("🚀".repeat(200))))).statusCode
    ).toBe(201);
    const alt = await call(
      api.stories,
      post(image({ alt: "x".repeat(420), caption: "y".repeat(100) }))
    );
    expect(alt.statusCode).toBe(201);
  });

  it("requires a JSON object body", async () => {
    expectError(
      await call(api.stories, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "hello",
      }),
      415,
      "unsupported_media_type"
    );
    expectError(
      await call(api.stories, post([textStory()])),
      400,
      "bad_request"
    );
  });

  it("answers 422 once the author has 10 active stories", async () => {
    // The demo user has one seeded story.
    for (let i = 1; i < 10; i++) await postStory(textStory(`story ${i}`));

    const res = await call(api.stories, post(textStory("eleven")));
    expectError(res, 422, "limit_exceeded");
    expect(res.body.error.message).toMatch(/at most 10 active stories/);
  });

  it("limits new stories per user (429 with Retry-After)", async () => {
    actAs("devmarco");
    for (let i = 0; i < 10; i++) {
      expect(
        (await call(api.stories, post(textStory(`${i}`)))).statusCode,
        `story ${i + 1}`
      ).toBe(201);
    }

    const limited = await call(api.stories, post(textStory("more")));
    expectError(limited, 429, "rate_limited");
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
    // Invalid requests don't use the budget, and other users have their own.
    expectInvalid(await call(api.stories, post(textStory(""))), "content.text");
    actAs("sarahcodes");
    expect((await call(api.stories, post(textStory()))).statusCode).toBe(201);
  });

  it("lifts the per-user limit with WRITE_RATE_LIMIT=0", async () => {
    vi.stubEnv("WRITE_RATE_LIMIT", "0");
    actAs("devmarco");
    for (let i = 0; i < 10; i++) await postStory(textStory(`${i}`));
    // Past the budget, the 10-story limit is what stops the 11th.
    expectError(
      await call(api.stories, post(textStory("eleven"))),
      422,
      "limit_exceeded"
    );
  });
});

describe("GET /api/stories/:id", () => {
  it("reads a story with the viewer's seen state", async () => {
    const res = await call(api.story, { query: { id: "seed-story05" } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.body.story).toMatchObject({
      id: "seed-story05",
      author: { username: "lenaframes" },
      viewer: { seen: true },
      views: null,
    });

    const own = await call(api.story, { query: { id: "seed-story07" } });
    expect(own.body.story.views).toBe(3);
  });

  it("answers 404 for unknown, malformed, expired and blocked stories", async () => {
    state().stories.stories.get("seed-story01")!.expiresAt =
      new Date().toISOString();
    state().stories.stories.get("seed-story02")!.blocked = true;

    for (const id of [
      "ghost",
      "private.storyview-seed-story07-sarahcodes",
      "drafts.seed-story03",
      "seed-story01",
      "seed-story02",
    ]) {
      const res = await call(api.story, { query: { id } });
      expectError(res, 404, "not_found", id);
      expect(res.body.error.message, id).toBe("Story not found");
    }
  });
});

describe("DELETE /api/stories/:id", () => {
  it("deletes your own story with its views", async () => {
    const res = await call(api.story, {
      method: "DELETE",
      query: { id: "seed-story07" },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers["cache-control"]).toBe("no-store");

    expectError(
      await call(api.story, { query: { id: "seed-story07" } }),
      404,
      "not_found"
    );
    expect(
      [...state().stories.views.values()].filter(
        (view) => view.storyId === "seed-story07"
      )
    ).toEqual([]);
    expectError(
      await call(api.story, {
        method: "DELETE",
        query: { id: "seed-story07" },
      }),
      404,
      "not_found"
    );
  });

  it("refuses others' stories (403) and unknown ones (404)", async () => {
    const res = await call(api.story, {
      method: "DELETE",
      query: { id: "seed-story05" },
    });
    expectError(res, 403, "forbidden");
    expect(res.body.error.message).toBe("You can only delete your own stories");
    expect(state().stories.stories.has("seed-story05")).toBe(true);

    expectError(
      await call(api.story, { method: "DELETE", query: { id: "ghost" } }),
      404,
      "not_found"
    );
  });
});

describe("GET /api/stories/:id/viewers", () => {
  it("lists who saw your story, most recent first", async () => {
    const res = await call(api.viewers, { query: { id: "seed-story07" } });

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.body.items).toEqual([
      {
        username: "superapp",
        fullname: "Twitter SuperApp",
        image: "/avatars/superapp.svg",
      },
      {
        username: "devmarco",
        fullname: "Marco Rossi",
        image: "/avatars/devmarco.svg",
      },
      {
        username: "sarahcodes",
        fullname: "Sarah Chen",
        image: "/avatars/sarahcodes.svg",
      },
    ]);
  });

  it("answers 404 to everyone but the author", async () => {
    for (const id of ["seed-story05", "ghost", "bad.id"]) {
      const res = await call(api.viewers, { query: { id } });
      expectError(res, 404, "not_found", id);
      expect(res.body.error.message, id).toBe("Story not found");
    }

    actAs("sarahcodes");
    expectError(
      await call(api.viewers, { query: { id: "seed-story07" } }),
      404,
      "not_found"
    );
    expect(
      (await call(api.viewers, { query: { id: "seed-story06" } })).statusCode
    ).toBe(200);
  });
});

describe("POST /api/stories/views", () => {
  it("marks stories seen by the current user, idempotently", async () => {
    for (let i = 0; i < 2; i++) {
      const res = await call(
        api.views,
        post({ ids: ["seed-story03", "seed-story04", "seed-story03"] })
      );
      expect(res.statusCode).toBe(204);
      expect(res.headers["cache-control"]).toBe("no-store");
    }

    const { items } = (await call(api.tray)).body;
    expect(
      items.find(
        (item: { author: { username: string } }) =>
          item.author.username === "foodie_ankara"
      )
    ).toMatchObject({ hasUnseen: false, firstUnseenId: null, unseenIds: [] });

    actAs("foodie_ankara");
    const viewers = await call(api.viewers, { query: { id: "seed-story03" } });
    expect(viewers.body.items).toEqual([
      {
        username: "illlhanozkan",
        fullname: "Ilhan Ozkan",
        image: "/avatars/illlhanozkan.svg",
      },
    ]);
  });

  it("ignores unknown, expired and blocked stories", async () => {
    state().stories.stories.get("seed-story01")!.blocked = true;
    const before = state().stories.views.size;

    const res = await call(
      api.views,
      post({ ids: ["ghost", "seed-story01", "story-unknown"] })
    );
    expect(res.statusCode).toBe(204);
    expect(state().stories.views.size).toBe(before);
  });

  it("takes 1 to 50 well-formed ids", async () => {
    const fifty = Array.from({ length: 50 }, (_, i) => `story-${i}`);
    expect((await call(api.views, post({ ids: fifty }))).statusCode).toBe(204);

    const cases: [unknown, string][] = [
      [{}, "ids"],
      [{ ids: "seed-story01" }, "ids"],
      [{ ids: [] }, "ids"],
      [{ ids: [...fifty, "story-50"] }, "ids"],
      [{ ids: ["seed-story01", "private.x"] }, "ids.1"],
      [{ ids: [42] }, "ids.0"],
      [{ ids: ["x".repeat(121)] }, "ids.0"],
    ];
    for (const [body, path] of cases) {
      expectInvalid(
        await call(api.views, post(body)),
        path,
        JSON.stringify(body).slice(0, 60)
      );
    }
  });
});

describe("identity", () => {
  it("ignores identity fields in bodies", async () => {
    const impostor = {
      author: "mallory",
      username: "mallory",
      viewer: "mallory",
      from: "mallory",
    };

    const story = await postStory({ ...textStory(), ...impostor });
    expect(story.author.username).toBe("illlhanozkan");

    await call(api.views, post({ ids: ["seed-story06"], ...impostor }));
    actAs("sarahcodes");
    const viewers = await call(api.viewers, { query: { id: "seed-story06" } });
    expect(
      viewers.body.items.map((viewer: { username: string }) => viewer.username)
    ).toEqual(["illlhanozkan"]);
  });
});

/** Every write, ready to call. */
const writes = (): [string, Handler, MockRequest][] => [
  ["POST stories", api.stories, post(textStory())],
  [
    "DELETE story",
    api.story,
    { method: "DELETE", query: { id: "seed-story07" } },
  ],
  ["POST views", api.views, post({ ids: ["seed-story01"] })],
];

describe("write protections", () => {
  it("rejects every write with 403 read_only in READ_ONLY mode; reads still work", async () => {
    vi.stubEnv("READ_ONLY", "true");
    for (const [name, handler, request] of writes()) {
      expectError(await call(handler, request), 403, "read_only", name);
    }
    expect(state().stories.stories.has("seed-story07")).toBe(true);
    expect((await call(api.tray)).statusCode).toBe(200);
    expect(
      (await call(api.story, { query: { id: "seed-story07" } })).statusCode
    ).toBe(200);
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

  it("answers 405 for other methods", async () => {
    const cases: [Handler, string][] = [
      [api.tray, "POST"],
      [api.views, "GET"],
      [api.viewers, "DELETE"],
      [api.stories, "DELETE"],
      [api.story, "POST"],
    ];
    for (const [handler, method] of cases) {
      const res = await call(handler, {
        method,
        query: { id: "seed-story07" },
      });
      expectError(res, 405, "method_not_allowed", method);
    }
  });

  it("parses bodies only on routes that take one", async () => {
    const config = async (path: string) => {
      const specifier = "../../" + path;
      return (await import(specifier)).config;
    };

    for (const path of [ROUTES.stories, ROUTES.views]) {
      expect(await config(path), path).toEqual({
        api: { bodyParser: { sizeLimit: "16kb" } },
      });
    }
    for (const path of [ROUTES.tray, ROUTES.story, ROUTES.viewers]) {
      expect(await config(path), path).toEqual({ api: { bodyParser: false } });
    }
  });
});

describe("feature gating", () => {
  it("reports stories as on", async () => {
    expect((await call(api.me)).body.features.stories).toBe(true);
  });

  it("turns every route into a 404 with DISABLED_FEATURES=stories", async () => {
    vi.stubEnv("DISABLED_FEATURES", "stories");

    const reads: [string, Handler, MockRequest][] = [
      ["GET tray", api.tray, {}],
      ["GET stories", api.stories, { query: { author: "sarahcodes" } }],
      ["GET story", api.story, { query: { id: "seed-story07" } }],
      ["GET viewers", api.viewers, { query: { id: "seed-story07" } }],
    ];
    for (const [name, handler, request] of [...reads, ...writes()]) {
      const res = await call(handler, request);
      expectError(res, 404, "not_found", name);
      expect(res.body.error.message, name).toBe("This feature is turned off");
    }
    expect((await call(api.me)).body.features.stories).toBe(false);
    expect(state().stories.stories.has("seed-story07")).toBe(true);
  });
});

describe("lib/client/storiesApi", () => {
  /** fetch, answered by the route handlers the way Next.js routes paths. */
  function routeFetch() {
    vi.stubGlobal("fetch", async (path: string, init: RequestInit = {}) => {
      const url = new URL(path, "http://localhost:3000");
      const [, , id, sub] = url.pathname.split("/").filter(Boolean);
      const query: Record<string, string> = Object.fromEntries(
        url.searchParams
      );
      let handler = api.stories;
      if (id === "tray") handler = api.tray;
      else if (id === "views") handler = api.views;
      else if (id) {
        query.id = decodeURIComponent(id);
        handler = sub === "viewers" ? api.viewers : api.story;
      }

      const res = await call(handler, {
        method: init.method ?? "GET",
        query,
        headers: init.headers as Record<string, string>,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      });
      return new Response(
        res.statusCode === 204 ? null : JSON.stringify(res.body),
        { status: res.statusCode }
      );
    });
  }

  it("calls every route with the shapes it expects", async () => {
    routeFetch();
    const { storiesApi } = await import("../../lib/client/storiesApi");

    expect((await storiesApi.tray()).items).toHaveLength(6);
    expect(
      (await storiesApi.list("foodie_ankara")).items.map((story) => story.id)
    ).toEqual(["seed-story03", "seed-story04"]);

    const { story } = await storiesApi.create({
      type: "image",
      image: "/media/stories/latte.svg",
      alt: "A latte",
    });
    expect(story.content).toEqual({
      type: "image",
      image: "/media/stories/latte.svg",
      alt: "A latte",
      caption: null,
    });
    expect((await storiesApi.get(story.id)).story).toEqual(story);

    await storiesApi.markSeen(["seed-story01", story.id]);
    expect((await storiesApi.get("seed-story01")).story.viewer.seen).toBe(true);
    expect((await storiesApi.viewers("seed-story07")).items).toHaveLength(3);

    await storiesApi.remove(story.id);
    await expect(storiesApi.get(story.id)).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
    await expect(storiesApi.viewers("seed-story05")).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("the /stories/[username] page", () => {
  /** getServerSideProps of pages/stories/[username].tsx, as Next.js calls it. */
  async function loadPage(
    username: string,
    query: Record<string, string> = {}
  ) {
    const { getServerSideProps } =
      await import("../../pages/stories/[username]");
    const context = {
      params: { username },
      query: { username, ...query },
      req: { headers: {} },
      res: { setHeader: () => {} },
      resolvedUrl: `/stories/${username}`,
    };
    return (await getServerSideProps(context as never)) as any;
  }

  it("serves the author's stories, oldest first, with the linked one", async () => {
    const result = await loadPage("foodie_ankara", { story: "seed-story04" });
    expect(result.props.author).toEqual({
      username: "foodie_ankara",
      fullname: "Mert Demir",
      image: "/avatars/foodie_ankara.svg",
    });
    expect(result.props.stories.map((story: IStory) => story.id)).toEqual([
      "seed-story03",
      "seed-story04",
    ]);
    expect(result.props.requested).toBe("seed-story04");
    expect(result.props.initialState.session.features.stories).toBe(true);
  });

  it("serves an account with no stories (the page says so)", async () => {
    const result = await loadPage("devmarco");
    expect(result.props.stories).toEqual([]);
    expect(result.props.requested).toBeNull();
  });

  it("redirects to the canonical casing, keeping the story", async () => {
    expect(await loadPage("Foodie_Ankara", { story: "seed-story04" })).toEqual({
      redirect: {
        destination: "/stories/foodie_ankara?story=seed-story04",
        permanent: false,
      },
    });
  });

  it("is a 404 for unknown or invalid usernames", async () => {
    expect(await loadPage("nobody_here")).toEqual({ notFound: true });
    expect(await loadPage("not a user")).toEqual({ notFound: true });
  });

  it("is a 404 while stories is off", async () => {
    // Before the first read: the repository settles its features once.
    vi.stubEnv("DISABLED_FEATURES", "stories");
    expect(await loadPage("foodie_ankara")).toEqual({ notFound: true });
  });
});
