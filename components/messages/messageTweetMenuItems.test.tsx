// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { ReactNode } from "react";
import { Provider } from "react-redux";
import { afterEach, describe, expect, it } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import { makeStore } from "../../store";
import { featuresWith, mockRouter } from "../../test/render";
import { ITweet } from "../../types/Tweet";
import { useMessageTweetMenuItems } from "./messageTweetMenuItems";
import { sarah, viewer } from "./testFixtures";

afterEach(cleanup);

const tweetBy = (author: typeof viewer): ITweet => ({
  id: "seed-t05",
  text: "Hello",
  image: null,
  createdAt: "2026-10-09T12:00:00.000Z",
  author,
  stats: { replies: 0, retweets: 0, likes: 0, tips: 0 },
  viewer: { liked: false, retweeted: false, bookmarked: false, tipped: false },
  attachment: null,
});

function renderItems(
  tweet: ITweet,
  { readOnly = false, on = true }: { readOnly?: boolean; on?: boolean } = {}
) {
  const store = makeStore({
    session: sessionState({
      viewer,
      readOnly,
      features: on ? featuresWith("messages") : featuresWith(),
    }),
  });
  const router = mockRouter();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <RouterContext.Provider value={router}>
      <Provider store={store}>{children}</Provider>
    </RouterContext.Provider>
  );
  const { result } = renderHook(() => useMessageTweetMenuItems(tweet), {
    wrapper,
  });
  return { items: result.current, store, router };
}

const labels = (items: { label: string }[]) => items.map((item) => item.label);

describe("useMessageTweetMenuItems", () => {
  it("shares others' Tweets and messages their authors", () => {
    const { items, store, router } = renderItems(tweetBy(sarah));
    expect(labels(items)).toEqual([
      "Send via Direct Message",
      "Message @sarahcodes",
    ]);

    items[0].onSelect();
    expect(store.getState().ui).toMatchObject({
      dialog: "newMessage",
      dialogArgs: { tweetId: "seed-t05" },
    });
    items[1].onSelect();
    expect(router.push).toHaveBeenCalledWith("/messages?to=sarahcodes");
  });

  it("only shares your own Tweets", () => {
    expect(labels(renderItems(tweetBy(viewer)).items)).toEqual([
      "Send via Direct Message",
    ]);
  });

  it("drops the share in READ_ONLY, and everything while Messages is off", () => {
    expect(
      labels(renderItems(tweetBy(sarah), { readOnly: true }).items)
    ).toEqual(["Message @sarahcodes"]);
    expect(renderItems(tweetBy(sarah), { on: false }).items).toEqual([]);
  });
});
