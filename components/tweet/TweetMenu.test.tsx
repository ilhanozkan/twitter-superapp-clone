// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import { renderWithStore, testViewer } from "../../test/render";
import { ITweet } from "../../types/Tweet";
import { MenuItem } from "../common/Menu";

// The lanes' hooks, stubbed per test (their F stubs return []).
const walletItems = vi.fn<(tweet: ITweet) => MenuItem[]>(() => []);
const messageItems = vi.fn<(tweet: ITweet) => MenuItem[]>(() => []);
vi.mock("../wallet/walletTweetMenuItems", () => ({
  useWalletTweetMenuItems: (tweet: ITweet) => walletItems(tweet),
}));
vi.mock("../messages/messageTweetMenuItems", () => ({
  useMessageTweetMenuItems: (tweet: ITweet) => messageItems(tweet),
}));

const { default: TweetMenu } = await import("./TweetMenu");

const tweetBy = (username: string): ITweet => ({
  id: "t1",
  text: "Hello",
  image: null,
  createdAt: "2026-10-09T12:00:00.000Z",
  author: { username, fullname: username, image: null },
  stats: { replies: 0, retweets: 0, likes: 0, tips: 0 },
  viewer: { liked: false, retweeted: false, bookmarked: false, tipped: false },
  attachment: null,
});

const item = (label: string): MenuItem => ({ label, onSelect: vi.fn() });

beforeEach(() => {
  walletItems.mockReturnValue([]);
  messageItems.mockReturnValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function menuItems() {
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "More options" }));
  return within(screen.getByRole("menu"))
    .getAllByRole("menuitem")
    .map((element) => element.textContent);
}

describe("TweetMenu", () => {
  it("is not shown on others' Tweets while no feature adds items", () => {
    renderWithStore(<TweetMenu tweet={tweetBy("sarahcodes")} />);
    expect(screen.queryByRole("button", { name: "More options" })).toBeNull();
    // The hooks still run on every render, in order.
    expect(walletItems).toHaveBeenCalled();
    expect(messageItems).toHaveBeenCalled();
  });

  it("shows the features' items on others' Tweets, wallet first", async () => {
    walletItems.mockReturnValue([item("Send credits to @sarahcodes")]);
    messageItems.mockReturnValue([
      item("Send via Direct Message"),
      item("Message @sarahcodes"),
    ]);
    renderWithStore(<TweetMenu tweet={tweetBy("sarahcodes")} />);
    expect(await menuItems()).toEqual([
      "Send credits to @sarahcodes",
      "Send via Direct Message",
      "Message @sarahcodes",
    ]);
  });

  it("puts Delete first on your own Tweets", async () => {
    messageItems.mockReturnValue([item("Send via Direct Message")]);
    renderWithStore(<TweetMenu tweet={tweetBy(testViewer.username)} />);
    expect(await menuItems()).toEqual(["Delete", "Send via Direct Message"]);
  });

  it("drops Delete in read-only mode, and the menu with it when nothing is left", () => {
    renderWithStore(<TweetMenu tweet={tweetBy(testViewer.username)} />, {
      state: {
        session: sessionState({ viewer: testViewer, readOnly: true }),
      },
    });
    expect(screen.queryByRole("button", { name: "More options" })).toBeNull();
  });
});
