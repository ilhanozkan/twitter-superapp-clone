// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import {
  flushSeen,
  restoreSeen,
  SEEN_STORAGE_KEY,
  storySeen,
} from "../../slices/storiesSlice";
import { makeStore } from "../../store";
import { testViewer } from "../../test/render";
import { stubStoriesApi } from "./testing";

// The stories slice's seen state (slices/storiesSlice.ts): what the tray
// greys and what the viewer reports to POST /api/stories/views.

const store = (readOnly = false) =>
  makeStore({ session: sessionState({ viewer: testViewer, readOnly }) });

const ids = (count: number) =>
  Array.from({ length: count }, (_, index) => `story-${index}`);

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("stories seen state", () => {
  it("reports at most 50 ids per request", async () => {
    const { calls } = stubStoriesApi({});
    const app = store();
    for (const id of ids(120)) app.dispatch(storySeen(id));

    await app.dispatch(flushSeen());
    expect(
      calls.map((call) => (call.body as { ids: string[] }).ids.length)
    ).toEqual([50, 50, 20]);
    expect(calls.every((call) => call.path === "/api/stories/views")).toBe(
      true
    );
    expect(app.getState().stories.pending).toEqual([]);
  });

  it("sends nothing when nothing new was watched", async () => {
    const { calls } = stubStoriesApi({});
    const app = store();
    app.dispatch(storySeen("seen-before", true));
    app.dispatch(storySeen("seen-before"));
    await app.dispatch(flushSeen());

    expect(calls).toEqual([]);
    expect(app.getState().stories.seen).toEqual({ "seen-before": true });
  });

  it("each story is reported once, however often it is shown", async () => {
    const { calls } = stubStoriesApi({});
    const app = store();
    app.dispatch(storySeen("a"));
    app.dispatch(storySeen("a"));
    await app.dispatch(flushSeen());
    app.dispatch(storySeen("a"));
    await app.dispatch(flushSeen());

    expect(calls.map((call) => call.body)).toEqual([{ ids: ["a"] }]);
  });

  it("keeps ids lost to a network error for the next batch", async () => {
    stubStoriesApi({}, { failViews: true });
    const app = store();
    app.dispatch(storySeen("a"));
    await app.dispatch(flushSeen());
    expect(app.getState().stories.pending).toEqual(["a"]);

    const { calls } = stubStoriesApi({});
    app.dispatch(storySeen("b"));
    await app.dispatch(flushSeen());
    expect(calls.map((call) => call.body)).toEqual([{ ids: ["a", "b"] }]);
  });

  it.each([
    [429, "rate_limited"],
    [500, "internal_error"],
    // A 503 from in front of the app (no JSON body), not the handler's.
    [503, "unknown_error"],
  ])(
    "keeps ids refused for now (%i %s) for the next batch",
    async (status, code) => {
      stubStoriesApi({}, { viewsError: { status, code } });
      const app = store();
      app.dispatch(storySeen("a"));
      await app.dispatch(flushSeen());
      expect(app.getState().stories.pending).toEqual(["a"]);
      expect(app.getState().stories.viewsRefused).toBe(false);
    }
  );

  it("stops reporting once the server says it can't store views (503 service_unavailable)", async () => {
    // Sanity without a token: reads work, and every write answers 503.
    const { calls } = stubStoriesApi(
      {},
      { viewsError: { status: 503, code: "service_unavailable" } }
    );
    const app = store();
    for (const id of ids(60)) app.dispatch(storySeen(id));
    for (let flush = 0; flush < 4; flush++) await app.dispatch(flushSeen());
    app.dispatch(storySeen("later"));
    await app.dispatch(flushSeen());

    expect(calls.map((call) => (call.body as { ids: string[] }).ids)).toEqual([
      ids(50),
    ]);
    const { stories } = app.getState();
    expect(stories.pending).toEqual([]);
    expect(stories.viewsRefused).toBe(true);
    // The rings still grey on this page.
    expect(Object.keys(stories.seen)).toHaveLength(61);
  });

  it("READ_ONLY: never posts, and keeps the ids in sessionStorage for the next load", async () => {
    const { calls } = stubStoriesApi({});
    const before = store(true);
    before.dispatch(storySeen("a"));
    before.dispatch(storySeen("b"));
    await before.dispatch(flushSeen());

    expect(calls).toEqual([]);
    expect(before.getState().stories.pending).toEqual([]);
    expect(
      JSON.parse(window.sessionStorage.getItem(SEEN_STORAGE_KEY)!)
    ).toEqual(["a", "b"]);

    const after = store(true);
    after.dispatch(restoreSeen());
    expect(after.getState().stories.seen).toEqual({ a: true, b: true });
  });

  it("READ_ONLY survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const app = store(true);
    expect(() => app.dispatch(storySeen("a"))).not.toThrow();
    app.dispatch(restoreSeen());
    expect(app.getState().stories.seen).toEqual({ a: true });
    vi.restoreAllMocks();
  });

  it("a writable demo doesn't touch sessionStorage", () => {
    const app = store();
    app.dispatch(storySeen("a"));
    app.dispatch(restoreSeen());
    expect(window.sessionStorage.getItem(SEEN_STORAGE_KEY)).toBeNull();
    expect(app.getState().stories.restored).toBe(false);
  });
});
