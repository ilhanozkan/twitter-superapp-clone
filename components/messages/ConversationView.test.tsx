// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../lib/client/request";
import { messagesState, ThreadState } from "../../slices/messagesSlice";
import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore } from "../../test/render";
import { IMessage } from "../../types/Message";
import {
  at,
  CONVERSATION_ID,
  conversation,
  message,
  page,
  sarah,
  thread,
  viewer,
} from "./testFixtures";

const api = vi.hoisted(() => ({
  listConversations: vi.fn(),
  openConversation: vi.fn(),
  getConversation: vi.fn(),
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
  sendPayment: vi.fn(),
  sendRequest: vi.fn(),
  markRead: vi.fn(),
}));
vi.mock("../../lib/client/messagesApi", () => ({ messagesApi: api }));
const walletApi = vi.hoisted(() => ({ activity: vi.fn() }));
vi.mock("../../lib/client/walletApi", () => ({ walletApi }));

const { default: ConversationView, CONVERSATION_POLL_MS } =
  await import("./ConversationView");

let visibility: DocumentVisibilityState = "visible";
function setVisibility(value: DocumentVisibilityState) {
  visibility = value;
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
  api.getConversation.mockResolvedValue({ conversation: conversation() });
  api.listMessages.mockResolvedValue(page([]));
  api.markRead.mockResolvedValue(undefined);
  walletApi.activity.mockResolvedValue({
    unreadConversations: 0,
    newNotifications: 0,
    live: [],
    serverNow: at("12:00"),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

const hello = message("m1", sarah, at("09:00"), "Friday coffee?");

function renderView({
  existing = thread([hello]),
  readOnly = false,
}: { existing?: ThreadState | null; readOnly?: boolean } = {}) {
  return renderWithStore(
    <ConversationView
      conversationId={CONVERSATION_ID}
      other={sarah}
      serverNow={at("12:00")}
    />,
    {
      state: {
        session: sessionState({
          viewer,
          readOnly,
          features: featuresWith("messages", "wallet"),
        }),
        messages: {
          ...messagesState([]),
          threads: existing ? { [CONVERSATION_ID]: existing } : {},
        },
      },
    }
  );
}

const sent = (text: string, id = "m2"): { message: IMessage } => ({
  message: message(id, viewer, at("12:00"), text),
});

describe("sending text", () => {
  it("shows the text at once, then Not sent, and retries with the same key", async () => {
    const user = userEvent.setup();
    let fail!: (reason: unknown) => void;
    api.sendMessage.mockImplementationOnce(
      () => new Promise((_, reject) => (fail = reject))
    );
    renderView();

    await user.type(
      screen.getByLabelText("Message Sarah Chen"),
      "On my way{Enter}"
    );
    expect(screen.getByText("On my way")).toBeTruthy();
    expect(screen.getByText("Sending…")).toBeTruthy();

    await act(async () =>
      fail(
        new ApiRequestError(
          0,
          "network_error",
          "Check your connection and try again."
        )
      )
    );
    expect(screen.getByRole("alert").textContent).toBe("Not sent");

    api.sendMessage.mockResolvedValueOnce(sent("On my way"));
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByText("Sending…")).toBeNull());
    expect(screen.queryByText("Not sent")).toBeNull();
    expect(screen.getAllByText("On my way")).toHaveLength(1);

    const [first, second] = api.sendMessage.mock.calls;
    expect(first[0]).toBe(CONVERSATION_ID);
    expect(first[1]).toEqual({ text: "On my way", tweetId: null });
    expect(second[2]).toBe(first[2]);
  });

  it("gives every new message its own key", async () => {
    const user = userEvent.setup();
    api.sendMessage
      .mockResolvedValueOnce(sent("One", "m2"))
      .mockResolvedValueOnce(sent("Two", "m3"));
    renderView();
    const box = screen.getByLabelText("Message Sarah Chen");
    await user.type(box, "One{Enter}");
    await user.type(box, "Two{Enter}");
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(2));
    expect(api.sendMessage.mock.calls[0][2]).not.toBe(
      api.sendMessage.mock.calls[1][2]
    );
  });

  it("opens a draft conversation with its first message", async () => {
    const user = userEvent.setup();
    api.openConversation.mockResolvedValue({ conversation: conversation() });
    api.sendMessage.mockResolvedValue(sent("Hi Sarah"));
    renderView({ existing: null });
    expect(
      screen.getByRole("heading", { name: "Say hi to Sarah Chen 👋" })
    ).toBeTruthy();

    await user.type(
      screen.getByLabelText("Message Sarah Chen"),
      "Hi Sarah{Enter}"
    );
    await waitFor(() =>
      expect(api.sendMessage).toHaveBeenCalledWith(
        CONVERSATION_ID,
        { text: "Hi Sarah", tweetId: null },
        expect.any(String)
      )
    );
    expect(api.openConversation).toHaveBeenCalledWith("sarahcodes");
    await waitFor(() => expect(screen.queryByText("Sending…")).toBeNull());
    expect(screen.getByText("Hi Sarah")).toBeTruthy();
  });
});

describe("polling", () => {
  it("polls every 4 s while visible, pauses while hidden and catches up on return", async () => {
    vi.useFakeTimers();
    renderView();
    const advance = (ms: number) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });

    await advance(CONVERSATION_POLL_MS);
    expect(api.getConversation).toHaveBeenCalledTimes(1);
    expect(api.listMessages).toHaveBeenLastCalledWith(CONVERSATION_ID, {
      after: "cursor-m1",
      limit: 50,
    });

    act(() => setVisibility("hidden"));
    await advance(CONVERSATION_POLL_MS * 5);
    expect(api.getConversation).toHaveBeenCalledTimes(1);

    act(() => setVisibility("visible"));
    await advance(0);
    expect(api.getConversation).toHaveBeenCalledTimes(2);
  });

  it("shows new messages from a poll", async () => {
    vi.useFakeTimers();
    const reply = message("m2", sarah, at("12:01"), "See you there");
    api.listMessages.mockResolvedValue(page([reply]));
    renderView();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONVERSATION_POLL_MS);
    });
    expect(screen.getByText("See you there")).toBeTruthy();
  });

  it("says so after two failed polls", async () => {
    vi.useFakeTimers();
    api.getConversation.mockRejectedValue(new Error("offline"));
    renderView();
    const status = () => screen.getAllByRole("status").at(-1)!.textContent;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONVERSATION_POLL_MS);
    });
    expect(status()).toBe("");
    await act(async () => {
      // The second poll waits twice as long (backoff).
      await vi.advanceTimersByTimeAsync(CONVERSATION_POLL_MS * 2);
    });
    expect(status()).toBe("Can’t load new messages. Retrying…");
  });

  it("doesn't poll a draft", async () => {
    vi.useFakeTimers();
    renderView({ existing: null });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONVERSATION_POLL_MS * 3);
    });
    expect(api.getConversation).not.toHaveBeenCalled();
  });
});

describe("read state", () => {
  it("marks an unread conversation read when it opens, then recounts the badge", async () => {
    const unread = thread([hello]);
    unread.conversation.unread = 1;
    const { store } = renderView({ existing: unread });
    await waitFor(() =>
      expect(api.markRead).toHaveBeenCalledWith(CONVERSATION_ID)
    );
    await waitFor(() => expect(walletApi.activity).toHaveBeenCalled());
    expect(
      store.getState().messages.threads[CONVERSATION_ID].conversation.unread
    ).toBe(0);
  });

  it("marks again at most once every 5 s", async () => {
    vi.useFakeTimers();
    const unread = thread([hello]);
    unread.conversation.unread = 1;
    // Every poll still reports something unread.
    api.getConversation.mockResolvedValue({
      conversation: conversation({ unread: 1 }),
    });
    renderView({ existing: unread });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api.markRead).toHaveBeenCalledTimes(1);

    // The 4 s poll reports unread again: the next mark waits for 5 s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONVERSATION_POLL_MS);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(api.markRead).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(499);
    });
    expect(api.markRead).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(api.markRead).toHaveBeenCalledTimes(2);
  });

  it("isn't marked while the tab is hidden, only once it shows", async () => {
    vi.useFakeTimers();
    visibility = "hidden";
    const unread = thread([hello]);
    unread.conversation.unread = 1;
    api.getConversation.mockResolvedValue({
      conversation: conversation({ unread: 1 }),
    });
    renderView({ existing: unread });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(api.markRead).not.toHaveBeenCalled();

    act(() => setVisibility("visible"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api.markRead).toHaveBeenCalledTimes(1);
    expect(api.markRead).toHaveBeenCalledWith(CONVERSATION_ID);
  });

  it("is not marked in READ_ONLY, where the composer is replaced", async () => {
    const unread = thread([hello]);
    unread.conversation.unread = 1;
    renderView({ existing: unread, readOnly: true });
    expect(
      screen.getByText("Messaging is turned off on this read-only demo.")
    ).toBeTruthy();
    expect(screen.queryByLabelText("Message Sarah Chen")).toBeNull();
    expect(screen.queryByRole("button", { name: "Send credits" })).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(api.markRead).not.toHaveBeenCalled();
  });
});
