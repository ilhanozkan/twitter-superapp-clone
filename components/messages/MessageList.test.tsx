// @vitest-environment jsdom
import { act, cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OutgoingMessage } from "../../slices/messagesSlice";
import { renderWithStore } from "../../test/render";
import MessageList from "./MessageList";
import { at, message, sarah, viewer } from "./testFixtures";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const first = message("m1", sarah, "2026-10-08T18:00:00.000Z", "Coffee?");
const second = message("m2", viewer, at("09:00"), "Yes!");

type Props = ComponentProps<typeof MessageList>;

function props(overrides: Partial<Props> = {}): Props {
  return {
    other: sarah,
    viewer: viewer.username,
    messages: [first, second],
    outbox: [],
    otherReadAt: null,
    serverNow: at("12:00"),
    hasOlder: false,
    onLoadOlder: vi.fn(async () => {}),
    onRetry: vi.fn(),
    ...overrides,
  };
}

const log = () => screen.getByRole("log", { name: "Messages with Sarah Chen" });

/** jsdom has no layout: pretend the reader scrolled up (or back down). */
function scrollLog(scrollTop: number) {
  Object.defineProperty(log(), "scrollTop", {
    configurable: true,
    value: scrollTop,
  });
  log().dispatchEvent(new Event("scroll"));
}

const announcer = () =>
  document.querySelector('[aria-live="polite"]')?.textContent ?? "";

describe("MessageList", () => {
  it("is a chat log grouped by day, naming who wrote each text", () => {
    renderWithStore(<MessageList {...props()} />);
    expect(log().getAttribute("aria-live")).toBe("off");
    const days = within(log())
      .getAllByRole("heading")
      .map((heading) => heading.textContent);
    expect(days).toEqual(["Yesterday", "Today"]);
    expect(within(log()).getByText("Sarah Chen:")).toBeTruthy();
    expect(within(log()).getByText("You:")).toBeTruthy();
    // The time is there for screen readers (and on hover or focus).
    expect(log().querySelectorAll("time")).toHaveLength(2);
  });

  it("shows Seen under my last message once the other member read it", () => {
    const { rerender } = renderWithStore(
      <MessageList {...props({ otherReadAt: at("08:59") })} />
    );
    expect(screen.queryByText("Seen")).toBeNull();
    rerender(<MessageList {...props({ otherReadAt: at("09:00") })} />);
    expect(screen.getByText("Seen")).toBeTruthy();
  });

  it("invites a first message when the conversation is empty", () => {
    renderWithStore(<MessageList {...props({ messages: [] })} />);
    expect(
      screen.getByRole("heading", { name: "Say hi to Sarah Chen 👋" })
    ).toBeTruthy();
  });

  it("shows sending texts, and failed ones with Retry", async () => {
    const user = userEvent.setup();
    const sending: OutgoingMessage = {
      key: "key-1",
      conversationId: "c",
      text: "On my way",
      tweetId: null,
      createdAt: at("11:00"),
      status: "sending",
      error: null,
    };
    const onRetry = vi.fn();
    const { rerender } = renderWithStore(
      <MessageList {...props({ outbox: [sending], onRetry })} />
    );
    expect(screen.getByText("On my way")).toBeTruthy();
    expect(screen.getByText("Sending…")).toBeTruthy();

    const failed = { ...sending, status: "failed" as const, error: "Offline" };
    rerender(<MessageList {...props({ outbox: [failed], onRetry })} />);
    expect(screen.getByRole("alert").textContent).toBe("Not sent");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledWith(failed);
  });

  it("loads older messages from the top", async () => {
    const user = userEvent.setup();
    const onLoadOlder = vi.fn(async () => {});
    renderWithStore(
      <MessageList {...props({ hasOlder: true, onLoadOlder })} />
    );
    await user.click(
      screen.getByRole("button", { name: "Load older messages" })
    );
    expect(onLoadOlder).toHaveBeenCalledTimes(1);
  });

  it("says when older messages can't be loaded", async () => {
    const user = userEvent.setup();
    renderWithStore(
      <MessageList
        {...props({
          hasOlder: true,
          onLoadOlder: vi.fn(async () => {
            throw new Error("Check your connection and try again.");
          }),
        })}
      />
    );
    await user.click(
      screen.getByRole("button", { name: "Load older messages" })
    );
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Check your connection and try again."
    );
  });

  it("shows a New messages pill for arrivals while scrolled up", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithStore(<MessageList {...props()} />);
    scrollLog(-600);

    const third = message("m3", sarah, at("11:00"), "Are you coming?");
    rerender(<MessageList {...props({ messages: [first, second, third] })} />);
    await user.click(screen.getByRole("button", { name: "New messages" }));
    expect(screen.queryByRole("button", { name: "New messages" })).toBeNull();
    expect(document.activeElement).toBe(log());
  });

  it("drops the pill once the reader scrolls down to the end", () => {
    const { rerender } = renderWithStore(<MessageList {...props()} />);
    scrollLog(-600);
    const third = message("m3", sarah, at("11:00"), "Are you coming?");
    rerender(<MessageList {...props({ messages: [first, second, third] })} />);
    expect(screen.getByRole("button", { name: "New messages" })).toBeTruthy();

    act(() => scrollLog(-20));
    expect(screen.queryByRole("button", { name: "New messages" })).toBeNull();
  });

  it("doesn't show the pill at the end of the conversation, or for older pages", () => {
    const { rerender } = renderWithStore(
      <MessageList {...props({ messages: [second] })} />
    );
    // Older messages (Load older) are not new.
    scrollLog(-600);
    rerender(<MessageList {...props({ messages: [first, second] })} />);
    expect(screen.queryByRole("button", { name: "New messages" })).toBeNull();

    scrollLog(0);
    const third = message("m3", sarah, at("11:00"), "Hi");
    rerender(<MessageList {...props({ messages: [first, second, third] })} />);
    expect(screen.queryByRole("button", { name: "New messages" })).toBeNull();
  });

  it("announces arrivals politely, at most once every 5 seconds", async () => {
    vi.useFakeTimers({ now: Date.parse(at("12:00")) });
    const { rerender } = renderWithStore(<MessageList {...props()} />);
    const arrive = async (...items: ReturnType<typeof message>[]) => {
      rerender(
        <MessageList {...props({ messages: [first, second, ...items] })} />
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
    };

    const a = message("m3", sarah, at("12:00"), "One");
    await arrive(a);
    expect(announcer()).toMatch(/^1 new message from Sarah Chen/);

    // Two more within 5 s wait for one combined announcement.
    const b = message("m4", sarah, at("12:01"), "Two");
    const c = message("m5", sarah, at("12:02"), "Three");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    await arrive(a, b);
    await arrive(a, b, c);
    expect(announcer()).toMatch(/^1 new message from Sarah Chen/);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_999);
    });
    expect(announcer()).toMatch(/^1 new message from Sarah Chen/);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(announcer()).toMatch(/^2 new messages from Sarah Chen/);
  });

  it("doesn't announce the viewer's own messages", async () => {
    vi.useFakeTimers({ now: Date.parse(at("12:00")) });
    const { rerender } = renderWithStore(<MessageList {...props()} />);
    rerender(
      <MessageList
        {...props({
          messages: [first, second, message("m3", viewer, at("12:00"), "Me")],
        })}
      />
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(announcer()).toBe("");
  });
});
