import { afterEach, describe, expect, it, vi } from "vitest";

import {
  initializeStore,
  makeStore,
  restoreTimelines,
  setHistoryNavigation,
} from "../store";
import { ITweet } from "../types/Tweet";
import { IUserProfile } from "../types/User";
import { profileState, selectTweetCount } from "./profilesSlice";
import { sessionState } from "./sessionSlice";
import { timelineFromPage } from "./timelinesSlice";
import {
  deleteTweet,
  postTweet,
  setReaction,
  tweetsAdapter,
} from "./tweetsSlice";

const tweet = (id: string, author = "someone"): ITweet => ({
  id,
  text: `tweet ${id}`,
  image: null,
  createdAt: "2026-10-08T12:00:00.000Z",
  author: { username: author, fullname: author, image: null },
  stats: { replies: 0, retweets: 0, likes: 3, tips: 0 },
  viewer: { liked: false, retweeted: false, bookmarked: false, tipped: false },
  attachment: null,
});

function storeWith(tweets: ITweet[]) {
  return makeStore({
    tweets: tweetsAdapter.setAll(tweetsAdapter.getInitialState(), tweets),
    timelines: {
      home: timelineFromPage({}, { items: tweets, nextCursor: null }),
      "author:me": timelineFromPage(
        { author: "Me" },
        { items: [], nextCursor: null }
      ),
      "search:x": timelineFromPage(
        { q: "x" },
        { items: tweets, nextCursor: null }
      ),
    },
  });
}

/** Resolves fetch with `body` (status 200) after `delay` ms. */
function respond(body: unknown, { status = 200, delay = 0 } = {}) {
  return () =>
    new Promise<Response>((resolve) =>
      setTimeout(
        () => resolve(new Response(JSON.stringify(body), { status })),
        delay
      )
    );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("setReaction", () => {
  it("updates optimistically, then takes the server's tweet", async () => {
    const store = storeWith([tweet("a")]);
    const server = {
      ...tweet("a"),
      stats: { replies: 0, retweets: 0, likes: 10 },
      viewer: { liked: true, retweeted: false, bookmarked: false },
    };
    vi.stubGlobal("fetch", vi.fn(respond({ tweet: server })));

    const pending = store.dispatch(
      setReaction({ id: "a", kind: "like", active: true })
    );
    expect(store.getState().tweets.entities.a.viewer.liked).toBe(true);
    expect(store.getState().tweets.entities.a.stats.likes).toBe(4);

    await pending;
    expect(store.getState().tweets.entities.a.stats.likes).toBe(10);
  });

  it("rolls back when the request fails", async () => {
    const store = storeWith([tweet("a")]);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        respond(
          {
            error: {
              code: "rate_limited",
              message: "slow down",
              requestId: "r",
            },
          },
          { status: 429 }
        )
      )
    );

    const result = await store.dispatch(
      setReaction({ id: "a", kind: "retweet", active: true })
    );

    expect(result.meta.requestStatus).toBe("rejected");
    expect(store.getState().tweets.entities.a.viewer.retweeted).toBe(false);
    expect(store.getState().tweets.entities.a.stats.retweets).toBe(0);
  });

  it("settles on the latest click when responses arrive out of order", async () => {
    const store = storeWith([tweet("a")]);
    const liked = {
      ...tweet("a"),
      viewer: { liked: true, retweeted: false, bookmarked: false },
      stats: { replies: 0, retweets: 0, likes: 4 },
    };
    const unliked = {
      ...tweet("a"),
      viewer: { liked: false, retweeted: false, bookmarked: false },
      stats: { replies: 0, retweets: 0, likes: 3 },
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(respond({ tweet: liked }, { delay: 30 })) // slow first click
        .mockImplementationOnce(respond({ tweet: unliked }, { delay: 1 }))
    );

    const first = store.dispatch(
      setReaction({ id: "a", kind: "like", active: true })
    );
    const second = store.dispatch(
      setReaction({ id: "a", kind: "like", active: false })
    );
    await Promise.all([first, second]);

    expect(store.getState().tweets.entities.a.viewer.liked).toBe(false);
    expect(store.getState().tweets.entities.a.stats.likes).toBe(3);
  });

  const rateLimited = () =>
    respond(
      { error: { code: "rate_limited", message: "slow down", requestId: "r" } },
      { status: 429, delay: 5 }
    );

  it("sends one request at a time and ends where the last click wants", async () => {
    const store = storeWith([tweet("a")]);
    const liked = {
      ...tweet("a"),
      viewer: { liked: true, retweeted: false, bookmarked: false },
      stats: { replies: 0, retweets: 0, likes: 4 },
    };
    const fetch = vi.fn(respond({ tweet: liked }, { delay: 10 }));
    vi.stubGlobal("fetch", fetch);

    // like, unlike, like: the last two arrive while the first is in flight.
    const clicks = [true, false, true].map((active) =>
      store.dispatch(setReaction({ id: "a", kind: "like", active }))
    );
    const results = await Promise.all(clicks);

    // The server already has what the last click wants: no second request.
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.meta.requestStatus)).toEqual([
      "fulfilled",
      "fulfilled",
      "fulfilled",
    ]);
    expect(results.map((r) => (r.payload as { stale: boolean }).stale)).toEqual(
      [true, true, false]
    );
    expect(store.getState().tweets.entities.a.viewer.liked).toBe(true);
    expect(store.getState().tweets.entities.a.stats.likes).toBe(4);
  });

  it("restores what the server has when overlapping clicks all fail", async () => {
    const store = storeWith([tweet("a")]);
    vi.stubGlobal("fetch", vi.fn(rateLimited()));

    const first = store.dispatch(
      setReaction({ id: "a", kind: "like", active: true })
    );
    const second = store.dispatch(
      setReaction({ id: "a", kind: "like", active: false })
    );
    const third = store.dispatch(
      setReaction({ id: "a", kind: "like", active: true })
    );
    const results = await Promise.all([first, second, third]);

    expect(results.map((r) => r.meta.requestStatus)).toEqual([
      "rejected",
      "rejected",
      "rejected",
    ]);
    // Only the latest click reports the failure (one error toast, not three).
    expect(results.map((r) => (r.payload as { stale: boolean }).stale)).toEqual(
      [true, true, false]
    );
    expect(store.getState().tweets.entities.a.viewer.liked).toBe(false);
    expect(store.getState().tweets.entities.a.stats.likes).toBe(3);
  });

  it("keeps the last confirmed state when a follow-up request fails", async () => {
    const store = storeWith([tweet("a")]);
    const liked = {
      ...tweet("a"),
      viewer: { liked: true, retweeted: false, bookmarked: false },
      stats: { replies: 0, retweets: 0, likes: 4 },
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(respond({ tweet: liked }, { delay: 10 }))
        .mockImplementationOnce(rateLimited())
    );

    const like = store.dispatch(
      setReaction({ id: "a", kind: "like", active: true })
    );
    const unlike = store.dispatch(
      setReaction({ id: "a", kind: "like", active: false })
    );
    await Promise.all([like, unlike]);

    // The like reached the server, the unlike did not.
    expect(store.getState().tweets.entities.a.viewer.liked).toBe(true);
    expect(store.getState().tweets.entities.a.stats.likes).toBe(4);
  });

  it("does not let one reaction's response undo another in flight", async () => {
    const store = storeWith([tweet("a")]);
    const likedOnly = {
      ...tweet("a"),
      viewer: { liked: true, retweeted: false, bookmarked: false },
      stats: { replies: 0, retweets: 0, likes: 4 },
    };
    const retweeted = {
      ...tweet("a"),
      viewer: { liked: false, retweeted: true, bookmarked: false },
      stats: { replies: 0, retweets: 1, likes: 3 },
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        // The like was read before the retweet was written, and arrives last.
        .mockImplementationOnce(respond({ tweet: likedOnly }, { delay: 20 }))
        .mockImplementationOnce(respond({ tweet: retweeted }, { delay: 1 }))
    );

    await Promise.all([
      store.dispatch(setReaction({ id: "a", kind: "like", active: true })),
      store.dispatch(setReaction({ id: "a", kind: "retweet", active: true })),
    ]);

    const { viewer, stats } = store.getState().tweets.entities.a;
    expect(viewer).toMatchObject({ liked: true, retweeted: true });
    expect(stats).toMatchObject({ likes: 4, retweets: 1 });
  });
});

describe("postTweet and deleteTweet", () => {
  it("prepends new tweets to home and the author's timeline only", async () => {
    const store = storeWith([tweet("a")]);
    vi.stubGlobal("fetch", vi.fn(respond({ tweet: tweet("new", "me") })));

    await store.dispatch(postTweet({ text: "hello" }));

    const { timelines, tweets } = store.getState();
    expect(timelines.home.ids).toEqual(["new", "a"]);
    expect(timelines["author:me"].ids).toEqual(["new"]);
    expect(timelines["search:x"].ids).toEqual(["a"]);
    expect(tweets.entities.new.text).toBe("tweet new");
  });

  it("removes deleted tweets everywhere", async () => {
    const store = storeWith([tweet("a"), tweet("b")]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 }))
    );

    await store.dispatch(deleteTweet("a"));

    expect(store.getState().timelines.home.ids).toEqual(["b"]);
    expect(store.getState().tweets.entities.a).toBeUndefined();
  });

  it("keeps the tweet counts of loaded profiles current", async () => {
    const me = { username: "Me", tweetCount: 7 } as IUserProfile;
    const other = { username: "someone", tweetCount: 2 } as IUserProfile;
    const store = makeStore({
      tweets: tweetsAdapter.setAll(tweetsAdapter.getInitialState(), [
        tweet("a", "Me"),
      ]),
      profiles: profileState(me),
    });

    vi.stubGlobal("fetch", vi.fn(respond({ tweet: tweet("new", "me") })));
    await store.dispatch(postTweet({ text: "hello" }));
    expect(selectTweetCount(store.getState(), me)).toBe(8);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 }))
    );
    await store.dispatch(deleteTweet("a"));
    await store.dispatch(deleteTweet("new"));
    expect(selectTweetCount(store.getState(), me)).toBe(6);
    // Profiles that were never loaded fall back to the server's count.
    expect(selectTweetCount(store.getState(), other)).toBe(2);
  });
});

describe("initializeStore", () => {
  it("creates a new store for every server render", () => {
    expect(initializeStore()).not.toBe(initializeStore());
  });

  it("starts from new page data on navigation but keeps client UI state", () => {
    vi.stubGlobal("window", {});
    const first = initializeStore({
      session: sessionState({ viewer: null, readOnly: false }),
    });
    first.dispatch({ type: "ui/openCompose" });

    const next = initializeStore({
      session: sessionState({ viewer: null, readOnly: true }),
    });

    expect(next).not.toBe(first);
    expect(next.getState().session.readOnly).toBe(true);
    expect(next.getState().ui.composeOpen).toBe(true);
    expect(initializeStore(undefined)).toBe(next);
  });
});

describe("navigation state", () => {
  const ids = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => `t${from + i}`);
  const home = (list: string[], nextCursor: string | null) => ({
    home: timelineFromPage(
      {},
      { items: list.map((id) => tweet(id)), nextCursor }
    ),
  });
  const pageState = (list: string[], nextCursor: string | null) => ({
    tweets: tweetsAdapter.setAll(
      tweetsAdapter.getInitialState(),
      list.map((id) => tweet(id))
    ),
    timelines: home(list, nextCursor),
  });

  it("Back keeps the pages loaded before, after the fresh first page", () => {
    // 3 pages were loaded; since then one new tweet (t0) arrived.
    const restored = restoreTimelines(
      home(ids(1, 9), "after-t9"),
      home(["t0", ...ids(1, 2)], "after-t2")
    );

    expect(restored.home.ids).toEqual(["t0", ...ids(1, 9)]);
    expect(restored.home.nextCursor).toBe("after-t9");
  });

  it("Back takes the fresh page when it cannot be joined without a gap", () => {
    const current = home(ids(1, 9), "after-t9");

    const disjoint = home(ids(20, 22), "after-t22");
    expect(restoreTimelines(current, disjoint).home.ids).toEqual(ids(20, 22));

    // The fresh page is everything there is (t9 was deleted, say).
    const complete = home(ids(1, 8), null);
    expect(restoreTimelines(current, complete).home.ids).toEqual(ids(1, 8));
  });

  it("keeps loaded tweets across pages, so Back can show them again", () => {
    vi.stubGlobal("window", {});
    initializeStore(pageState(ids(1, 9), "after-t9"));

    // Open one tweet: its page only carries that tweet.
    const status = initializeStore({
      tweets: tweetsAdapter.setAll(tweetsAdapter.getInitialState(), [
        { ...tweet("t5"), text: "fresh copy" },
      ]),
    });
    expect(status.getState().tweets.entities.t9).toBeDefined();
    expect(status.getState().tweets.entities.t5.text).toBe("fresh copy");

    setHistoryNavigation(true);
    const back = initializeStore(pageState(ids(1, 3), "after-t3"));
    const { timelines, tweets } = back.getState();
    expect(timelines.home.ids).toEqual(ids(1, 9));
    expect(timelines.home.ids.every((id) => tweets.entities[id])).toBe(true);

    // A link to the same page starts from its first page again.
    setHistoryNavigation(false);
    const link = initializeStore(pageState(ids(1, 3), "after-t3"));
    expect(link.getState().timelines.home.ids).toEqual(ids(1, 3));
  });

  it("Back restores pages even when the page in between had a timeline", () => {
    vi.stubGlobal("window", {});
    setHistoryNavigation(false);
    initializeStore(pageState(ids(1, 9), "after-t9"));

    // A profile: its own timeline, not Home's.
    initializeStore({
      tweets: tweetsAdapter.setAll(tweetsAdapter.getInitialState(), [
        tweet("p1", "someone"),
      ]),
      timelines: {
        "author:someone": timelineFromPage(
          { author: "someone" },
          { items: [tweet("p1", "someone")], nextCursor: null }
        ),
      },
    });

    setHistoryNavigation(true);
    const back = initializeStore(pageState(ids(1, 3), "after-t3"));
    expect(back.getState().timelines.home.ids).toEqual(ids(1, 9));
    setHistoryNavigation(false);
  });

  it("settles a reaction in the current store after a navigation", async () => {
    vi.stubGlobal("window", {});
    setHistoryNavigation(false);
    const before = initializeStore(pageState(ids(1, 3), null));
    vi.stubGlobal(
      "fetch",
      vi.fn(
        respond(
          { error: { code: "internal_error", message: "x", requestId: "r" } },
          { status: 503, delay: 10 }
        )
      )
    );

    const like = before.dispatch(
      setReaction({ id: "t2", kind: "like", active: true })
    );
    // Navigate while the request is in flight: the optimistic like is
    // carried into the new store.
    const after = initializeStore({
      session: sessionState({ viewer: null, readOnly: false }),
    });
    expect(after.getState().tweets.entities.t2.viewer.liked).toBe(true);

    await like;
    expect(after.getState().tweets.entities.t2.viewer.liked).toBe(false);
    expect(after.getState().tweets.entities.t2.stats.likes).toBe(3);
  });
});
