import { afterEach, describe, expect, it, vi } from "vitest";

import { initializeStore, makeStore } from "../store";
import { ITweet } from "../types/Tweet";
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
  stats: { replies: 0, retweets: 0, likes: 3 },
  viewer: { liked: false, retweeted: false, bookmarked: false },
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
});

describe("initializeStore", () => {
  it("creates a new store for every server render", () => {
    expect(initializeStore()).not.toBe(initializeStore());
  });

  it("starts from new page data on navigation but keeps client UI state", () => {
    vi.stubGlobal("window", {});
    const first = initializeStore({
      session: { viewer: null, readOnly: false },
    });
    first.dispatch({ type: "ui/openCompose" });

    const next = initializeStore({ session: { viewer: null, readOnly: true } });

    expect(next).not.toBe(first);
    expect(next.getState().session.readOnly).toBe(true);
    expect(next.getState().ui.composeOpen).toBe(true);
    expect(initializeStore(undefined)).toBe(next);
  });
});
