// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { messagesState } from "../../slices/messagesSlice";
import { sessionState } from "../../slices/sessionSlice";
import { tweetsAdapter } from "../../slices/tweetsSlice";
import { openDialog } from "../../slices/uiSlice";
import { featuresWith, renderWithStore } from "../../test/render";
import { ITweet } from "../../types/Tweet";
import {
  at,
  CONVERSATION_ID,
  conversation,
  message,
  sarah,
  viewer,
} from "./testFixtures";

const api = vi.hoisted(() => ({
  listConversations: vi.fn(),
  openConversation: vi.fn(),
  sendMessage: vi.fn(),
}));
vi.mock("../../lib/client/messagesApi", () => ({ messagesApi: api }));
const walletApi = vi.hoisted(() => ({ searchUsers: vi.fn() }));
vi.mock("../../lib/client/walletApi", () => ({ walletApi }));

const { default: MessageDialogs } = await import("./MessageDialogs");

const marco = { username: "devmarco", fullname: "Marco Rossi", image: null };
const tweet: ITweet = {
  id: "seed-t20",
  text: "Golden hour over Ankara",
  image: null,
  createdAt: at("08:00"),
  author: { username: "lenaframes", fullname: "Lena Hoffmann", image: null },
  stats: { replies: 0, retweets: 0, likes: 0, tips: 0 },
  viewer: { liked: false, retweeted: false, bookmarked: false, tipped: false },
  attachment: null,
};

beforeEach(() => {
  walletApi.searchUsers.mockResolvedValue({
    items: [
      { ...viewer, bio: null },
      { ...sarah, bio: null },
      { ...marco, bio: null },
    ],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderDialogs(args?: Record<string, string>) {
  const result = renderWithStore(<MessageDialogs />, {
    state: {
      session: sessionState({
        viewer,
        readOnly: false,
        features: featuresWith("messages"),
      }),
      messages: messagesState([conversation()]),
      tweets: tweetsAdapter.setAll(tweetsAdapter.getInitialState(), [tweet]),
    },
  });
  result.store.dispatch(openDialog("newMessage", args));
  return result;
}

describe("New message", () => {
  it("offers recent conversations, searches people and opens the chosen one", async () => {
    const user = userEvent.setup();
    const { router, store } = renderDialogs();
    const dialog = await screen.findByRole("dialog", { name: "New message" });
    const field = within(dialog).getByRole("combobox", { name: "To" });

    // Recent people before anything is typed.
    expect(
      within(dialog).getByRole("listbox", { name: "Recent conversations" })
        .textContent
    ).toContain("Sarah Chen");

    await user.type(field, "o");
    await waitFor(() =>
      expect(within(dialog).getByRole("status").textContent).toBe(
        "2 people found"
      )
    );
    expect(walletApi.searchUsers).toHaveBeenCalledWith("o", 8);
    // The viewer is never offered.
    expect(within(dialog).queryByText("Ilhan Ozkan")).toBeNull();

    await user.keyboard("{ArrowDown}{ArrowDown}");
    const active = field.getAttribute("aria-activedescendant")!;
    expect(document.getElementById(active)?.textContent).toContain(
      "Marco Rossi"
    );
    await user.keyboard("{Enter}");
    expect(router.push).toHaveBeenCalledWith("/messages?to=devmarco");
    expect(store.getState().ui.dialog).toBeNull();
  });

  it("says when nobody matches", async () => {
    const user = userEvent.setup();
    walletApi.searchUsers.mockResolvedValue({ items: [] });
    renderDialogs();
    const dialog = await screen.findByRole("dialog", { name: "New message" });
    await user.type(within(dialog).getByRole("combobox"), "zzz");
    await waitFor(() =>
      expect(within(dialog).getByRole("status").textContent).toBe(
        "No people found"
      )
    );
    expect(
      within(dialog).getByRole("combobox").getAttribute("aria-expanded")
    ).toBe("false");
  });

  it("closes the list on Escape, keeping the dialog open", async () => {
    const user = userEvent.setup();
    renderDialogs();
    const dialog = await screen.findByRole("dialog", { name: "New message" });
    const field = within(dialog).getByRole("combobox");
    await user.click(field);
    expect(field.getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{Escape}");
    expect(field.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("dialog", { name: "New message" })).toBeTruthy();
  });
});

describe("Send via Direct Message", () => {
  it("sends the Tweet with a comment to the chosen person", async () => {
    const user = userEvent.setup();
    api.openConversation.mockResolvedValue({ conversation: conversation() });
    api.sendMessage.mockResolvedValue({
      message: message("m9", viewer, at("12:00"), {
        type: "text",
        text: "Look at this",
        tweet: { id: tweet.id, author: tweet.author, text: tweet.text },
        story: null,
      }),
    });
    const { store } = renderDialogs({ tweetId: tweet.id });
    const dialog = await screen.findByRole("dialog", { name: "Send Tweet" });
    expect(within(dialog).getByText("Golden hour over Ankara")).toBeTruthy();
    const send = within(dialog).getByRole("button", { name: "Send" });
    expect((send as HTMLButtonElement).disabled).toBe(true);

    await user.click(
      within(dialog).getByRole("option", { name: /Sarah Chen/ })
    );
    expect(within(dialog).getByText("To")).toBeTruthy();
    const comment = within(dialog).getByLabelText(/Add a comment/);
    expect(document.activeElement).toBe(comment);
    await user.type(comment, "Look at this");
    await user.click(send);

    await waitFor(() => expect(store.getState().ui.dialog).toBeNull());
    expect(api.openConversation).toHaveBeenCalledWith("sarahcodes");
    const [id, body, key] = api.sendMessage.mock.calls[0];
    expect(id).toBe(CONVERSATION_ID);
    expect(body).toEqual({ text: "Look at this", tweetId: tweet.id });
    expect(key).toEqual(expect.any(String));
    expect(store.getState().ui.toasts[0]).toMatchObject({
      message: "Sent to Sarah Chen",
      action: { label: "View", href: `/messages/${CONVERSATION_ID}` },
    });
  });

  it("keeps the dialog open with the reason when sending fails", async () => {
    const user = userEvent.setup();
    api.openConversation.mockRejectedValue(new Error("User not found"));
    renderDialogs({ tweetId: tweet.id });
    const dialog = await screen.findByRole("dialog", { name: "Send Tweet" });
    await user.click(
      within(dialog).getByRole("option", { name: /Sarah Chen/ })
    );
    await user.click(within(dialog).getByRole("button", { name: "Send" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "User not found"
    );
    // Back to choosing someone else.
    await user.click(
      within(dialog).getByRole("button", { name: "Remove Sarah Chen" })
    );
    expect(within(dialog).getByRole("combobox", { name: "To" })).toBeTruthy();
  });
});
