import { describe, expect, it, vi } from "vitest";

import { compareOldestFirst } from "../../lib/superapp/messages";
import reducer, {
  conversationOpened,
  conversationRead,
  initialMessagesState,
  mergeMessages,
  messageAdded,
  MessagesState,
  messagesState,
  olderLoaded,
  pollThread,
  requestUpdated,
  SETTLE_MS,
  textFailed,
  textQueued,
  textSent,
  threadPolled,
} from "../../slices/messagesSlice";
import { makeStore } from "../../store";
import { IMessage } from "../../types/Message";
import {
  at,
  CONVERSATION_ID,
  conversation,
  message,
  page,
  paymentRequest,
  sarah,
  thread,
  viewer,
} from "./testFixtures";

// The messages slice lives in slices/; its tests sit here, inside the
// lane's component folder.

const api = vi.hoisted(() => ({
  getConversation: vi.fn(),
  listMessages: vi.fn(),
}));
vi.mock("../../lib/client/messagesApi", () => ({ messagesApi: api }));

const m1 = message("m1", sarah, at("09:00"), "one");
const m2 = message("m2", viewer, at("10:00"), "two");
const m3 = message("m3", sarah, at("11:00"), "three");

const withThread = (messages = [m1, m2]): MessagesState => ({
  ...messagesState([conversation({ lastMessage: messages.at(-1) ?? null })]),
  threads: { [CONVERSATION_ID]: thread(messages) },
});

describe("mergeMessages", () => {
  it("keeps each id once, the incoming copy, oldest first", () => {
    const paid = { ...m2, body: { ...m2.body } };
    expect(mergeMessages([m3, m1], [paid, m1]).map((m) => m.id)).toEqual([
      "m1",
      "m2",
      "m3",
    ]);
    expect(mergeMessages([m2], [paid])[0]).toBe(paid);
  });

  it("keeps an answered request over a pending copy read before the answer", () => {
    const pending = message("m4", sarah, at("11:00"), {
      type: "request",
      request: paymentRequest(),
    });
    const cancelled = {
      ...pending,
      body: {
        type: "request" as const,
        request: paymentRequest({ status: "cancelled" }),
      },
    };
    const [merged] = mergeMessages([cancelled], [pending]);
    expect(merged.body).toBe(cancelled.body);
    expect(mergeMessages([pending], [cancelled])[0]).toBe(cancelled);
  });

  it("never undoes a removal with a copy read before it", () => {
    const removed: IMessage = {
      ...m2,
      body: { type: "removed", by: "author" },
    };
    expect(mergeMessages([removed], [m2])[0]).toBe(removed);
    expect(mergeMessages([m2], [removed])[0]).toBe(removed);
  });
});

describe("messagesState", () => {
  it("marks a failed inbox read as an error", () => {
    expect(messagesState(null).inbox).toEqual({
      items: [],
      loaded: false,
      error: "Your conversations can’t be loaded.",
    });
  });
});

describe("threadPolled", () => {
  it("adds new messages and takes the conversation's read state", () => {
    const state = reducer(
      withThread(),
      threadPolled({
        conversation: conversation({ otherReadAt: at("10:30"), unread: 1 }),
        page: page([m3]),
        latest: false,
      })
    );
    const updated = state.threads[CONVERSATION_ID];
    expect(updated.messages.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    expect(updated.conversation.otherReadAt).toBe(at("10:30"));
    expect(updated.newestCursor).toBe("cursor-m3");
    expect(state.inbox.items[0].unread).toBe(1);
  });

  it("keeps the cursor while nothing is new", () => {
    const state = reducer(
      withThread(),
      threadPolled({
        conversation: conversation(),
        page: page([], { newestCursor: null }),
        latest: false,
      })
    );
    expect(state.threads[CONVERSATION_ID].newestCursor).toBe("cursor-m2");
  });

  it("replaces the list when the newest page leaves a gap", () => {
    const newer = message("m9", sarah, at("11:30"), "nine");
    const state = reducer(
      withThread(),
      threadPolled({
        conversation: conversation(),
        page: page([newer], { olderCursor: "older-than-m9" }),
        latest: true,
      })
    );
    expect(state.threads[CONVERSATION_ID]).toMatchObject({
      messages: [newer],
      olderCursor: "older-than-m9",
    });
  });

  it("joins an overlapping newest page, updating what it shows", () => {
    const request = message("m4", sarah, at("11:00"), {
      type: "request",
      request: paymentRequest(),
    });
    const paid = {
      ...request,
      body: {
        type: "request" as const,
        request: paymentRequest({ status: "paid" }),
      },
    };
    const state = reducer(
      withThread([m1, request]),
      threadPolled({
        conversation: conversation(),
        page: page([paid], { olderCursor: "c" }),
        latest: true,
      })
    );
    const { messages, olderCursor } = state.threads[CONVERSATION_ID];
    expect(messages.map((m) => m.id)).toEqual(["m1", "m4"]);
    expect(messages[1]).toEqual(paid);
    expect(olderCursor).toBeNull();
  });

  it("leaves messages older than those shown to Load older", () => {
    const m0 = message("m0", viewer, at("08:00"), "zero");
    const state = reducer(
      {
        ...withThread(),
        threads: {
          [CONVERSATION_ID]: thread([m1, m2], { olderCursor: "older-than-m1" }),
        },
      },
      threadPolled({
        conversation: conversation(),
        page: page([m0, m1, m2, m3]),
        latest: true,
      })
    );
    const { messages, olderCursor } = state.threads[CONVERSATION_ID];
    expect(messages.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    expect(olderCursor).toBe("older-than-m1");
  });

  it("ignores conversations that aren't open", () => {
    const state = reducer(
      initialMessagesState,
      threadPolled({
        conversation: conversation(),
        page: page([m1]),
        latest: true,
      })
    );
    expect(state).toEqual(initialMessagesState);
  });
});

describe("olderLoaded", () => {
  it("puts the older page before the messages shown", () => {
    const state = reducer(
      withThread([m3]),
      olderLoaded({
        conversationId: CONVERSATION_ID,
        page: page([m1, m2], { olderCursor: null }),
      })
    );
    expect(state.threads[CONVERSATION_ID].messages.map((m) => m.id)).toEqual([
      "m1",
      "m2",
      "m3",
    ]);
    expect(state.threads[CONVERSATION_ID].olderCursor).toBeNull();
  });
});

describe("sending", () => {
  const outgoing = {
    key: "key-1",
    conversationId: CONVERSATION_ID,
    text: "three",
    tweetId: null,
    createdAt: at("11:00"),
    status: "sending" as const,
    error: null,
  };

  it("shows a text at once, marks a failure, and confirms it with the server's message", () => {
    let state = reducer(withThread(), textQueued(outgoing));
    expect(state.outbox).toEqual([outgoing]);

    state = reducer(state, textFailed({ key: "key-1", error: "Offline" }));
    expect(state.outbox[0]).toMatchObject({
      status: "failed",
      error: "Offline",
    });

    // Retry queues the same key again: still one entry.
    state = reducer(state, textQueued(outgoing));
    expect(state.outbox).toHaveLength(1);

    const sent = message("m3", viewer, at("11:00"), "three");
    state = reducer(state, textSent({ key: "key-1", message: sent }));
    expect(state.outbox).toEqual([]);
    expect(state.threads[CONVERSATION_ID].messages.at(-1)).toEqual(sent);
    expect(state.inbox.items[0].lastMessage).toEqual(sent);
  });

  it("moves the conversation to the top of the inbox", () => {
    const marco = conversation({
      id: "dm-devmarco-illlhanozkan",
      updatedAt: at("10:30"),
    });
    let state: MessagesState = messagesState([
      marco,
      conversation({ updatedAt: at("08:00") }),
    ]);
    state = reducer(
      state,
      messageAdded(message("m5", sarah, at("11:00"), "hi"))
    );
    expect(state.inbox.items.map((item) => item.id)).toEqual([
      CONVERSATION_ID,
      marco.id,
    ]);
  });

  it("lists a conversation opened by a send and gets it ready to show", () => {
    const opened = conversation({ id: "dm-illlhanozkan-nightowl_dev" });
    const state = reducer(initialMessagesState, conversationOpened(opened));
    expect(state.inbox.items).toEqual([opened]);
    expect(state.threads[opened.id]).toMatchObject({
      messages: [],
      newestCursor: null,
    });
  });
});

describe("requests and read state", () => {
  it("updates every bubble and preview showing a request", () => {
    const request = message("m4", sarah, at("11:00"), {
      type: "request",
      request: paymentRequest(),
    });
    let state = withThread([m1, request]);
    state.inbox.items[0] = conversation({ lastMessage: request });
    state = reducer(
      state,
      requestUpdated(paymentRequest({ status: "declined" }))
    );
    const body = state.threads[CONVERSATION_ID].messages[1].body;
    expect(body.type === "request" && body.request.status).toBe("declined");
    const preview = state.inbox.items[0].lastMessage!.body;
    expect(preview.type === "request" && preview.request.status).toBe(
      "declined"
    );
  });

  it("keeps a request answered here when a poll read before the answer lands", () => {
    const request = message("m4", sarah, at("11:00"), {
      type: "request",
      request: paymentRequest(),
    });
    let state = withThread([m1, request]);
    state.threads[CONVERSATION_ID].conversation.lastMessage = request;
    state.inbox.items[0] = conversation({ lastMessage: request });
    state = reducer(state, requestUpdated(paymentRequest({ status: "paid" })));
    // The poll was served while the request was still pending.
    state = reducer(
      state,
      threadPolled({
        conversation: conversation({ lastMessage: request }),
        page: page([m1, request], { olderCursor: null }),
        latest: true,
      })
    );
    const status = (m: IMessage | null) =>
      m?.body.type === "request" && m.body.request.status;
    expect(status(state.threads[CONVERSATION_ID].messages[1])).toBe("paid");
    expect(
      status(state.threads[CONVERSATION_ID].conversation.lastMessage)
    ).toBe("paid");
    expect(status(state.inbox.items[0].lastMessage)).toBe("paid");
  });

  it("clears unread in the thread and the inbox", () => {
    let state = withThread();
    state.threads[CONVERSATION_ID].conversation.unread = 2;
    state.inbox.items[0].unread = 2;
    state = reducer(state, conversationRead(CONVERSATION_ID));
    expect(state.threads[CONVERSATION_ID].conversation.unread).toBe(0);
    expect(state.inbox.items[0].unread).toBe(0);
  });
});

describe("pollThread", () => {
  /** 2026-10-09 at 12:00:ss UTC. */
  const second = (ss: number) =>
    new Date(Date.parse(at("12:00")) + ss * 1_000).toISOString();

  /**
   * The server as the client sees it: messages in (createdAt, id) order
   * once committed, whatever order they were dated in, and cursors that
   * point at a message (`cursor-<id>`).
   */
  function fakeServer(committed: IMessage[], now: string) {
    const server = { committed, now };
    api.getConversation.mockImplementation(async () => ({
      conversation: conversation(),
    }));
    api.listMessages.mockImplementation(
      async (_id: string, query: { after?: string; limit: number }) => {
        const sorted = [...server.committed].sort(compareOldestFirst);
        const cursor = query.after
          ? sorted.find((m) => `cursor-${m.id}` === query.after)!
          : null;
        const items = cursor
          ? sorted
              .filter((m) => compareOldestFirst(cursor, m) < 0)
              .slice(0, query.limit)
          : sorted.slice(-query.limit);
        return page(items, {
          newestCursor: items.length
            ? `cursor-${items.at(-1)!.id}`
            : (query.after ?? null),
          serverNow: server.now,
        });
      }
    );
    return server;
  }

  it("keeps reading the newest page until the newest message settles, so a late commit still shows", async () => {
    const m0 = message("m0", sarah, at("11:00"), "earlier");
    // Alice's message is dated first but commits after Bob's.
    const late = message("a", viewer, second(0), "dated first");
    const early = message("b", sarah, second(1), "committed first");
    const server = fakeServer([m0, early], second(2));
    const store = makeStore({
      messages: withThread([m0]),
    });
    const poll = () => store.dispatch(pollThread(CONVERSATION_ID));
    const shown = () =>
      store
        .getState()
        .messages.threads[CONVERSATION_ID].messages.map((m) => m.id);

    // m0 is hours old: only what is new.
    await poll();
    expect(api.listMessages).toHaveBeenLastCalledWith(CONVERSATION_ID, {
      after: "cursor-m0",
      limit: 50,
    });
    expect(shown()).toEqual(["m0", "b"]);

    server.committed.push(late);
    server.now = second(6);
    await poll();
    // "b" is seconds old: the newest page, which has the late message.
    expect(api.listMessages).toHaveBeenLastCalledWith(CONVERSATION_ID, {
      limit: 50,
    });
    expect(shown()).toEqual(["m0", "a", "b"]);

    // Once the newest message is SETTLE_MS old, back to the cursor.
    server.now = new Date(Date.parse(second(1)) + SETTLE_MS).toISOString();
    await poll();
    await poll();
    expect(api.listMessages).toHaveBeenLastCalledWith(CONVERSATION_ID, {
      after: "cursor-b",
      limit: 50,
    });
    expect(shown()).toEqual(["m0", "a", "b"]);
  });
});
