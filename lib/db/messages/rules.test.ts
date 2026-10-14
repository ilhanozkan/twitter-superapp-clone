import { describe, expect, it } from "vitest";

import {
  channelConversationId,
  chatMessageId,
  compareOldestFirst,
  directConversationId,
  greetingMessageId,
  isChannelConversationId,
  isDirectConversationId,
  isUnread,
  laterOf,
  memberKey,
  parseChannelHandle,
} from "../../superapp/messages";
import {
  allowsMoney,
  canChangeRoles,
  canLeave,
  canModerate,
  canPost,
  canRead,
  isMember,
  removalBy,
} from "../../superapp/policy/messages";
import { IPaymentRequest } from "../../../types/Wallet";
import { encodeCursor } from "../cursor";
import {
  ChannelSummary,
  compareChannels,
  compareMembers,
  MemberRecord,
  MessageRecord,
  planPage,
  referencedIds,
  toChannel,
  toMessage,
  toPage,
} from "./records";

// The messages lane's pure rules (lib/superapp/messages.ts, its policy and
// the shared record conversions). The stores' behaviour is covered by
// lib/db/messages.contract.test.ts.

const alice = { username: "alice", fullname: "Alice", image: null };
const bob = { username: "Bob", fullname: "Bob", image: "/avatars/bob.svg" };

const record = (
  fields: Partial<MessageRecord> & Pick<MessageRecord, "content">
): MessageRecord => ({
  id: "msg-1",
  conversationId: "dm-alice-bob",
  author: alice,
  createdAt: "2026-10-08T12:00:00.000Z",
  removed: null,
  requestHash: null,
  ...fields,
});

const text = (value: string, extra: Partial<MessageRecord["content"]> = {}) =>
  ({
    type: "text",
    text: value,
    tweetId: null,
    storyId: null,
    storyAuthor: null,
    ...extra,
  }) as MessageRecord["content"];

const noRefs = { tweets: new Map(), stories: new Map(), requests: new Map() };

describe("ids", () => {
  it("give two people one direct conversation, whoever opens it", () => {
    expect(directConversationId("SarahCodes", "illlhanozkan")).toBe(
      "dm-illlhanozkan-sarahcodes"
    );
    expect(directConversationId("illlhanozkan", "sarahcodes")).toBe(
      "dm-illlhanozkan-sarahcodes"
    );
    expect(isDirectConversationId("dm-a-b")).toBe(true);
    expect(isDirectConversationId("channel-ankara_eats")).toBe(false);
  });

  it("derive memberships, greetings and money bubbles deterministically", () => {
    expect(memberKey("dm-a-b", "Bob")).toBe("member-dm-a-b-bob");
    expect(greetingMessageId("dm-a-b")).toBe("msg-greeting-dm-a-b");
    expect(chatMessageId("tx-0123abcd")).toBe("msg-0123abcd");
    expect(chatMessageId("req-0123abcd")).toBe("msg-0123abcd");
  });
});

describe("read state", () => {
  const message = { author: bob, createdAt: "2026-10-08T12:00:00.000Z" };

  it("counts other people's messages after the read marker", () => {
    expect(isUnread(message, "alice", null)).toBe(true);
    expect(isUnread(message, "alice", "2026-10-08T11:59:59.999Z")).toBe(true);
    expect(isUnread(message, "alice", "2026-10-08T12:00:00.000Z")).toBe(false);
    expect(isUnread(message, "BOB", null)).toBe(false);
  });

  it("only moves read markers forward", () => {
    const earlier = "2026-10-08T11:00:00.000Z";
    const later = "2026-10-08T12:00:00.000Z";
    expect(laterOf(null, earlier)).toBe(earlier);
    expect(laterOf(earlier, later)).toBe(later);
    expect(laterOf(later, earlier)).toBe(later);
  });
});

describe("policy", () => {
  it("keeps direct conversations to members and channels open to read", () => {
    expect(isMember(null)).toBe(false);
    expect(isMember("member")).toBe(true);
    expect(canRead("direct", null)).toBe(false);
    expect(canRead("direct", "member")).toBe(true);
    expect(canRead("channel", null)).toBe(true);
    expect(canPost(null)).toBe(false);
    expect(canPost("member")).toBe(true);
  });

  it("lets owners and moderators moderate, and money move only in direct conversations", () => {
    expect(canModerate("owner")).toBe(true);
    expect(canModerate("moderator")).toBe(true);
    expect(canModerate("member")).toBe(false);
    expect(canModerate(null)).toBe(false);
    expect(allowsMoney("direct")).toBe(true);
    expect(allowsMoney("channel")).toBe(false);
  });
});

describe("toMessage", () => {
  it("hides the content of removed messages", () => {
    expect(
      toMessage(record({ content: text("Spam"), removed: "moderator" }), noRefs)
    ).toMatchObject({ body: { type: "removed", by: "moderator" } });
  });

  it("shows a request as it is now, and skips one that can't be read", () => {
    const request = { id: "req-1", status: "paid" } as IPaymentRequest;
    const bubble = record({ content: { type: "request", requestId: "req-1" } });
    expect(
      toMessage(bubble, { ...noRefs, requests: new Map([["req-1", request]]) })
    ).toMatchObject({ body: { type: "request", request } });
    expect(toMessage(bubble, noRefs)).toBeNull();
  });

  it("shows shared Tweets while they exist and stories while they last", () => {
    const reply = record({
      content: text("Nice", {
        tweetId: "t1",
        storyId: "s1",
        storyAuthor: bob,
      }),
    });
    expect(toMessage(reply, noRefs)?.body).toEqual({
      type: "text",
      text: "Nice",
      tweet: null,
      story: { id: "s1", author: bob, preview: null },
    });
  });
});

describe("referencedIds", () => {
  it("lists each Tweet, story and request once, skipping removed messages", () => {
    expect(
      referencedIds([
        record({ content: text("a", { tweetId: "t1" }) }),
        record({ content: text("b", { tweetId: "t1", storyId: "s1" }) }),
        record({ content: text("c", { tweetId: "t2" }), removed: "author" }),
        record({ content: { type: "request", requestId: "r1" } }),
        record({ content: { type: "request", requestId: "r1" } }),
      ])
    ).toEqual({ tweetIds: ["t1"], storyIds: ["s1"], requestIds: ["r1"] });
  });
});

describe("paging", () => {
  const rows = [1, 2, 3].map((minute) => ({
    id: `m${minute}`,
    createdAt: `2026-10-08T12:0${minute}:00.000Z`,
  }));

  it("reads the newest page newest first and returns it oldest first", () => {
    const plan = planPage({ limit: 2 });
    expect(plan).toMatchObject({ before: null, after: null, ascending: false });
    const newestFirst = [...rows].reverse();
    expect(toPage(newestFirst, plan)).toEqual({
      items: [rows[1], rows[2]],
      olderCursor: encodeCursor(rows[1]),
      newestCursor: encodeCursor(rows[2]),
    });
    expect(toPage(newestFirst.slice(0, 2), plan).olderCursor).toBeNull();
    expect(toPage([], plan)).toEqual({
      items: [],
      olderCursor: null,
      newestCursor: null,
    });
  });

  it("reads after a cursor oldest first, echoing it while nothing is new", () => {
    const after = encodeCursor(rows[0]);
    const plan = planPage({ after, limit: 1 });
    expect(plan.ascending).toBe(true);
    expect(toPage(rows.slice(1), plan)).toEqual({
      items: [rows[1]],
      olderCursor: encodeCursor(rows[1]),
      newestCursor: encodeCursor(rows[1]),
    });
    expect(toPage([], plan)).toEqual({
      items: [],
      olderCursor: null,
      newestCursor: after,
    });
  });

  it("ignores cursors it didn't make and clamps the limit", () => {
    expect(planPage({ before: "nope", after: "", limit: 500 })).toMatchObject({
      before: null,
      after: null,
      limit: 50,
    });
  });
});

describe("compareOldestFirst", () => {
  it("orders by time, then by id, as the server pages", () => {
    const at = (minute: number) => `2026-10-08T12:0${minute}:00.000Z`;
    const items = [
      { id: "b", createdAt: at(2) },
      { id: "c", createdAt: at(1) },
      { id: "a", createdAt: at(2) },
    ];
    expect([...items].sort(compareOldestFirst).map((item) => item.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(compareOldestFirst(items[0], items[0])).toBe(0);
  });
});

describe("channels", () => {
  it("names a channel's conversation after its handle", () => {
    expect(channelConversationId("ankara_eats")).toBe("channel-ankara_eats");
    expect(isChannelConversationId("channel-ankara_eats")).toBe(true);
    expect(isChannelConversationId("dm-a-b")).toBe(false);
    expect(memberKey("channel-ankara_eats", "SarahCodes")).toBe(
      "member-channel-ankara_eats-sarahcodes"
    );
  });

  it("reads handles from URLs in lower case, or not at all", () => {
    expect(parseChannelHandle("Ankara_Eats")).toBe("ankara_eats");
    expect(parseChannelHandle("abc")).toBe("abc");
    for (const value of [
      "ab",
      "a".repeat(31),
      "ankara-eats",
      "ankara eats",
      "private.x",
      "",
      ["ankara_eats"],
      undefined,
    ]) {
      expect(parseChannelHandle(value), String(value)).toBeNull();
    }
  });

  it("lets owners and moderators remove anyone's message, authors their own", () => {
    expect(removalBy("member", true)).toBe("author");
    expect(removalBy(null, true)).toBe("author");
    expect(removalBy("moderator", true)).toBe("author");
    expect(removalBy("moderator", false)).toBe("moderator");
    expect(removalBy("owner", false)).toBe("moderator");
    expect(removalBy("member", false)).toBeNull();
    expect(removalBy(null, false)).toBeNull();
  });

  it("keeps roles and leaving to the owner's rules", () => {
    expect(canChangeRoles("owner")).toBe(true);
    for (const role of ["moderator", "member", null] as const) {
      expect(canChangeRoles(role), String(role)).toBe(false);
    }
    expect(canLeave("owner")).toBe(false);
    expect(canLeave("moderator")).toBe(true);
    expect(canLeave("member")).toBe(true);
    expect(canLeave(null)).toBe(false);
  });

  const summary = (
    handle: string,
    memberCount: number,
    lastAt: string | null,
    member: MemberRecord | null = null
  ): ChannelSummary => ({
    conversation: {
      id: channelConversationId(handle),
      kind: "channel",
      createdAt: "2026-10-01T00:00:00.000Z",
      channel: { handle, name: handle, description: null, owner: alice },
    },
    memberCount,
    member,
    last: lastAt
      ? record({
          createdAt: lastAt,
          content: {
            type: "text",
            text: "Hi",
            tweetId: null,
            storyId: null,
            storyAuthor: null,
          },
        })
      : null,
    unread: 2,
  });

  it("orders lists by activity or by size, ties by handle", () => {
    const quiet = summary("quiet", 9, null);
    const busy = summary("busy", 2, "2026-10-09T00:00:00.000Z");
    const also = summary("also_busy", 2, "2026-10-09T00:00:00.000Z");
    const handles = (list: ChannelSummary[]) =>
      list.map((entry) => entry.conversation.channel.handle);

    expect(
      handles([quiet, busy, also].sort(compareChannels("activity")))
    ).toEqual(["also_busy", "busy", "quiet"]);
    expect(
      handles([busy, also, quiet].sort(compareChannels("members")))
    ).toEqual(["quiet", "also_busy", "busy"]);
  });

  it("shows unread only to members", () => {
    const member: MemberRecord = {
      conversationId: "channel-room",
      user: bob,
      role: "moderator",
      joinedAt: "2026-10-01T00:00:00.000Z",
      lastReadAt: null,
    };
    expect(toChannel(summary("room", 3, null, member), null).viewer).toEqual({
      role: "moderator",
      unread: 2,
    });
    expect(toChannel(summary("room", 3, null), null).viewer).toEqual({
      role: null,
      unread: 0,
    });
  });

  it("lists the owner, then moderators, then members, by username", () => {
    const member = (username: string, role: MemberRecord["role"]) =>
      ({
        conversationId: "channel-room",
        user: { username, fullname: username, image: null },
        role,
        joinedAt: "2026-10-01T00:00:00.000Z",
        lastReadAt: null,
      }) satisfies MemberRecord;
    const sorted = [
      member("zed", "member"),
      member("Bea", "moderator"),
      member("amy", "member"),
      member("own", "owner"),
      member("al", "moderator"),
    ].sort(compareMembers);
    expect(sorted.map((m) => m.user.username)).toEqual([
      "own",
      "al",
      "Bea",
      "amy",
      "zed",
    ]);
  });
});
