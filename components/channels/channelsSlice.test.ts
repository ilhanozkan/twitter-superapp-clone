import { describe, expect, it } from "vitest";

import reducer, {
  channelRead,
  channelsState,
  channelUpdated,
  messageRemoved,
  textQueued,
  textSent,
  threadPolled,
} from "../../slices/channelsSlice";
import {
  channel,
  channelMessage,
  HANDLE,
  page,
  sarah,
  viewer,
} from "./testFixtures";

// The channels slice (slices/channelsSlice.ts; the lane's test files live
// beside its components). Thunks are covered through the components.

const first = channelMessage("m1", sarah, "2026-10-09T09:00:00.000Z", "Hi");
const second = channelMessage("m2", viewer, "2026-10-09T09:05:00.000Z", "Hey");

describe("channelsSlice", () => {
  it("starts from what the server read, and says when a list failed", () => {
    const state = channelsState({
      mine: null,
      discover: [channel(null)],
      thread: { channel: channel(null), page: page([first]) },
    });
    expect(state.mine).toEqual({
      items: [],
      loaded: false,
      error: "Channels can’t be loaded right now.",
    });
    expect(state.discover.loaded).toBe(true);
    expect(state.threads[HANDLE].messages).toEqual([first]);
    // A list the page didn't read is neither loaded nor failed.
    expect(channelsState({}).mine).toEqual({
      items: [],
      loaded: false,
      error: null,
    });
  });

  it("moves a channel into Your channels on joining, and out on leaving", () => {
    let state = channelsState({ mine: [], discover: [channel(null)] });
    state = reducer(
      state,
      channelUpdated(channel("member", { memberCount: 5 }))
    );
    expect(state.mine.items.map((c) => c.handle)).toEqual([HANDLE]);
    expect(state.discover.items[0].memberCount).toBe(5);

    state = reducer(state, channelUpdated(channel(null)));
    expect(state.mine.items).toEqual([]);
    expect(state.discover.items[0].viewer.role).toBeNull();
  });

  it("merges polls by id, so a removal shows on the next poll", () => {
    let state = channelsState({
      thread: { channel: channel("member"), page: page([first, second]) },
    });
    const removed = {
      ...first,
      body: { type: "removed" as const, by: "moderator" as const },
    };
    state = reducer(
      state,
      threadPolled({
        channel: channel("member", { memberCount: 6 }),
        page: page([removed, second]),
      })
    );
    expect(state.threads[HANDLE].messages.map((m) => m.body.type)).toEqual([
      "removed",
      "text",
    ]);
    expect(state.threads[HANDLE].channel.memberCount).toBe(6);
  });

  it("replaces the thread when a poll can't join what is shown", () => {
    let state = channelsState({
      thread: { channel: channel("member"), page: page([first]) },
    });
    const later = channelMessage(
      "m9",
      sarah,
      "2026-10-09T11:00:00.000Z",
      "Late"
    );
    state = reducer(
      state,
      threadPolled({
        channel: channel("member"),
        page: page([later], { olderCursor: "older" }),
      })
    );
    expect(state.threads[HANDLE].messages).toEqual([later]);
    expect(state.threads[HANDLE].olderCursor).toBe("older");
  });

  it("marks a message removed in its thread and as the last message", () => {
    let state = channelsState({
      thread: {
        channel: channel("moderator", { lastMessage: second }),
        page: page([first, second]),
      },
    });
    state = reducer(
      state,
      messageRemoved({ handle: HANDLE, messageId: "m2", by: "author" })
    );
    expect(state.threads[HANDLE].messages[1].body).toEqual({
      type: "removed",
      by: "author",
    });
    expect(state.threads[HANDLE].channel.lastMessage?.body).toEqual({
      type: "removed",
      by: "author",
    });
  });

  it("swaps a sent text for the server's message", () => {
    let state = channelsState({
      mine: [channel("member", { viewer: { role: "member", unread: 3 } })],
      thread: { channel: channel("member"), page: page([first]) },
    });
    state = reducer(
      state,
      textQueued({
        key: "k1",
        conversationId: `channel-${HANDLE}`,
        text: "Hey",
        tweetId: null,
        createdAt: second.createdAt,
        status: "sending",
        error: null,
      })
    );
    state = reducer(state, textSent({ key: "k1", message: second }));
    expect(state.outbox).toEqual([]);
    expect(state.threads[HANDLE].messages.map((m) => m.id)).toEqual([
      "m1",
      "m2",
    ]);
    expect(state.threads[HANDLE].channel.lastMessage?.id).toBe("m2");

    state = reducer(state, channelRead(HANDLE));
    expect(state.mine.items[0].viewer.unread).toBe(0);
  });
});
