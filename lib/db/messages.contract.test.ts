import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  expectLedgerInvariants,
  expectStoresAgree,
  Subject,
  SUBJECT_NOW,
  subjects,
} from "../../test/repositorySubjects";
import { IMessage } from "../../types/Message";
import { IStory } from "../../types/Story";
import { IAuthor } from "../../types/User";
import {
  fingerprint,
  operationId,
  OperationScope,
} from "../superapp/idempotency";
import { chatMessageId, memberKey } from "../superapp/messages";
import { encodeCursor } from "./cursor";
import {
  ConflictError,
  ForbiddenError,
  IdempotencyKeyReusedError,
  InsufficientFundsError,
  InvalidStateError,
  LimitExceededError,
  NotFoundError,
  WalletFrozenError,
} from "./errors";
import { createMemoryRepository, createMemoryState } from "./memory";
import { ChatMoneyInput, NewMessage } from "./messages/types";
import { conversationDocument, memberDocument } from "./sanity/messages";
import { createSeedData, DEMO_USERNAME } from "./seed";
import { Repository } from "./types";

// Direct messages on both stores: opening conversations (with a business's
// greeting), text, shared Tweets and story replies, paging, read markers,
// and payments and requests in chat, each one atomic with its bubble. Fresh
// accounts (alice_test, ...) keep the assertions independent of what later
// lanes add to the seed world.

const MINUTE = 60_000;

const person = (username: string, fullname: string): IAuthor => ({
  username,
  fullname,
  image: `/avatars/${username}.svg`,
});
const me = person(DEMO_USERNAME, "Ilhan Ozkan");
const sarah = person("sarahcodes", "Sarah Chen");
const marco = person("devmarco", "Marco Rossi");
const ayse = person("ayse_design", "Ayşe Yılmaz");
const kahve = person("kizilaykahve", "Kızılay Kahve");
const lab = person("lahmacunlab", "Lahmacun Lab");
const lena = person("lenaframes", "Lena Hoffmann");
const fresh = (username: string): IAuthor => ({
  username,
  fullname: username.replace("_test", " Test"),
  image: null,
});
const alice = fresh("alice_test");
const bob = fresh("bob_test");
const carol = fresh("carol_test");

const GREETING =
  "Merhaba! 👋 This is Kızılay Kahve's automatic greeting. You can order from our menu anytime.";

const SEEDED = {
  sarah: "dm-illlhanozkan-sarahcodes",
  marco: "dm-devmarco-illlhanozkan",
  kahve: "dm-illlhanozkan-kizilaykahve",
  ayse: "dm-ayse_design-illlhanozkan",
};
const ALICE_BOB = "dm-alice_test-bob_test";

let keys = 0;
const nextKey = () => `test-key-${++keys}`;

/** The ids a route would derive from the actor, scope, key and body. */
const keyed = (
  actor: IAuthor,
  scope: OperationScope,
  prefix: "tx" | "req" | "msg",
  body: unknown,
  key = nextKey()
) => ({
  operationId: operationId(prefix, actor.username, scope, key),
  fingerprint: fingerprint(body),
});

const textInput = (
  conversationId: string,
  author: IAuthor,
  text: string,
  {
    key,
    tweetId = null,
    storyId = null,
  }: { key?: string; tweetId?: string | null; storyId?: string | null } = {}
): NewMessage => ({
  ...keyed(
    author,
    "messages.send",
    "msg",
    { conversationId, text, tweetId, storyId },
    key
  ),
  conversationId,
  author,
  text,
  tweetId,
  storyId,
});

const chatMoney =
  (scope: "messages.payment" | "messages.request", prefix: "tx" | "req") =>
  (
    conversationId: string,
    from: IAuthor,
    amount: number,
    { key, note = null }: { key?: string; note?: string | null } = {}
  ): ChatMoneyInput => ({
    ...keyed(from, scope, prefix, { conversationId, amount, note }, key),
    conversationId,
    from,
    amount,
    note,
  });
const paymentInput = chatMoney("messages.payment", "tx");
const requestInput = chatMoney("messages.request", "req");

const topUpInput = (to: IAuthor, amount: number) => ({
  ...keyed(to, "wallet.topUp", "tx", { amount }),
  to,
  amount,
});

const payInput = (payer: IAuthor, id: string) => ({
  ...keyed(payer, "wallet.payRequest", "tx", { id }),
  id,
  payer,
});

const at = (ms: number) => new Date(SUBJECT_NOW.getTime() + ms).toISOString();

/** A channel, written the way the channels lane stores one (it reuses this engine). */
function addChannel(subject: Subject, id: string, owner: IAuthor) {
  const createdAt = subject.clock.now().toISOString();
  const conversation = { id, kind: "channel" as const, createdAt };
  const member = {
    conversationId: id,
    user: owner,
    role: "owner" as const,
    joinedAt: createdAt,
    lastReadAt: createdAt,
  };
  if (subject.state) {
    subject.state.messages.conversations.set(id, conversation);
    subject.state.messages.members.set(memberKey(id, owner.username), member);
    return;
  }
  for (const document of [
    conversationDocument(conversation),
    memberDocument(member),
  ]) {
    subject.client!.documents.push({
      ...document,
      _createdAt: createdAt,
      _updatedAt: createdAt,
      _rev: `test-${document._id}`,
    });
  }
}

describe.each(subjects())("%s messages", (name, create) => {
  let subject: Subject;
  let repo: Repository;

  /** Transactions committed so far (Sanity); memory has no transactions to count. */
  const transactions = () => subject.client?.mutationLog.length ?? 0;
  const balance = async (user: IAuthor) =>
    (await repo.wallet.getWallet(user.username)).balance;
  const fund = (user: IAuthor, amount = 2_500) =>
    repo.wallet.topUp(topUpInput(user, amount));
  const open = async (viewer = alice, other = bob) =>
    (await repo.messages.openDirect(viewer, other)).conversation;
  const page = async (id: string, viewer = alice, limit = 50) =>
    (await repo.messages.listMessages(id, viewer.username, { limit })).items;

  beforeEach(() => {
    subject = create();
    repo = subject.repo;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("seeded conversations", () => {
    it("serve the demo user's inbox, with Sarah's request unread", async () => {
      const inbox = await repo.messages.listConversations(DEMO_USERNAME);
      const seeded = new Set(Object.values(SEEDED));
      expect(
        inbox
          .map((conversation) => conversation.id)
          .filter((id) => seeded.has(id))
      ).toEqual([SEEDED.marco, SEEDED.sarah, SEEDED.ayse, SEEDED.kahve]);
      const byId = new Map(inbox.map((c) => [c.id, c]));

      const withSarah = byId.get(SEEDED.sarah)!;
      expect(withSarah).toMatchObject({
        kind: "direct",
        other: sarah,
        unread: 1,
        lastMessage: {
          id: "seed-msg-sarah-03",
          author: sarah,
          body: {
            type: "request",
            request: {
              id: "seed-req01",
              amount: 450,
              note: "Coffee ☕",
              status: "pending",
              conversationId: SEEDED.sarah,
            },
          },
        },
      });
      expect(withSarah.updatedAt).toBe(withSarah.lastMessage!.createdAt);

      const withMarco = byId.get(SEEDED.marco)!;
      expect(withMarco).toMatchObject({
        other: marco,
        unread: 0,
        lastMessage: {
          author: me,
          body: { type: "text", text: "Anytime! 🙌" },
        },
      });
      // Marco has read it ("Seen").
      expect(Date.parse(withMarco.otherReadAt!)).toBeGreaterThanOrEqual(
        Date.parse(withMarco.lastMessage!.createdAt)
      );
      expect(byId.get(SEEDED.kahve)).toMatchObject({ other: kahve, unread: 0 });
      expect(byId.get(SEEDED.ayse)).toMatchObject({
        other: ayse,
        unread: 0,
        lastMessage: {
          author: ayse,
          body: { text: "Paid ✅ that pizza was worth it" },
        },
      });

      expect(await repo.messages.unreadConversations(DEMO_USERNAME)).toBe(1);
      expect(
        await repo.messages.getConversation(SEEDED.sarah, "SarahCodes")
      ).toMatchObject({ other: me, unread: 0 });
    });

    it("point their money bubbles at the wallet's records", async () => {
      const [payment, reply] = await page(SEEDED.marco, me);
      expect(payment).toMatchObject({
        id: "seed-msg-marco-01",
        author: marco,
        body: {
          type: "payment",
          transferId: "seed-tx03",
          amount: 1_500,
          note: "Thanks for the code review 🙏",
        },
      });
      expect(reply.body).toMatchObject({ text: "Anytime! 🙌" });
      expect(await repo.wallet.getTransfer("seed-tx03")).toMatchObject({
        createdAt: payment.createdAt,
        amount: 1_500,
        context: { type: "conversation", id: SEEDED.marco },
      });

      const [request] = await page(SEEDED.ayse, me);
      expect(request).toMatchObject({
        author: me,
        body: {
          type: "request",
          request: {
            id: "seed-req02",
            status: "paid",
            transferId: "seed-tx04",
            conversationId: SEEDED.ayse,
          },
        },
      });

      const [greeting, question, answer] = await page(SEEDED.kahve, me);
      expect(greeting).toEqual({
        id: "msg-greeting-dm-illlhanozkan-kizilaykahve",
        conversationId: SEEDED.kahve,
        author: kahve,
        createdAt: greeting.createdAt,
        body: { type: "text", text: GREETING, tweet: null, story: null },
      });
      expect([question.author, answer.author]).toEqual([me, kahve]);
    });

    it("pass the ledger invariants", async () => {
      await expectLedgerInvariants(subject);
    });
  });

  describe("openDirect", () => {
    it("opens one conversation per pair, with a sorted, case-insensitive id", async () => {
      const first = await repo.messages.openDirect(alice, {
        ...bob,
        username: "Bob_Test",
      });
      expect(first).toEqual({
        created: true,
        conversation: {
          id: ALICE_BOB,
          kind: "direct",
          other: { ...bob, username: "Bob_Test" },
          lastMessage: null,
          unread: 0,
          otherReadAt: null,
          updatedAt: SUBJECT_NOW.toISOString(),
        },
      });

      subject.clock.advance(MINUTE);
      const again = await repo.messages.openDirect(bob, {
        ...alice,
        username: "ALICE_TEST",
      });
      expect(again.created).toBe(false);
      // The opener has read everything so far.
      expect(again.conversation).toMatchObject({
        id: ALICE_BOB,
        other: alice,
        otherReadAt: SUBJECT_NOW.toISOString(),
      });
      expect(await repo.messages.findDirect("BOB_test", "alice_test")).toEqual(
        again.conversation
      );
      await expect(
        repo.messages.openDirect(alice, { ...alice, username: "Alice_Test" })
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("greets once when someone opens a conversation with a business", async () => {
      const { conversation } = await repo.messages.openDirect(sarah, kahve);
      expect(conversation).toMatchObject({
        id: "dm-kizilaykahve-sarahcodes",
        other: kahve,
        unread: 0,
        lastMessage: {
          id: "msg-greeting-dm-kizilaykahve-sarahcodes",
          author: kahve,
          body: { type: "text", text: GREETING, tweet: null, story: null },
        },
      });
      // The business wrote it, so it isn't unread for the business either.
      expect(
        await repo.messages.getConversation(conversation.id, "kizilaykahve")
      ).toMatchObject({ other: sarah, unread: 0 });

      await repo.messages.openDirect(sarah, kahve);
      await repo.messages.openDirect(kahve, sarah);
      expect(await page(conversation.id, sarah)).toHaveLength(1);

      // No greeting without one on the profile, or from a person.
      expect((await open(sarah, lab)).lastMessage).toBeNull();
      expect((await open(kahve, alice)).lastMessage).toBeNull();
    });

    it("creates one conversation and one greeting under concurrent opens", async () => {
      if (subject.client) {
        // Every open reads before any of them writes.
        subject.client.fetchDelay = () =>
          new Promise((resolve) => setImmediate(resolve));
      }
      const opened = await Promise.all(
        Array.from({ length: 5 }, () => repo.messages.openDirect(sarah, kahve))
      );
      if (subject.client) subject.client.fetchDelay = undefined;

      expect(opened.filter((result) => result.created)).toHaveLength(1);
      expect(new Set(opened.map((result) => result.conversation.id))).toEqual(
        new Set(["dm-kizilaykahve-sarahcodes"])
      );
      expect(await page("dm-kizilaykahve-sarahcodes", sarah)).toHaveLength(1);
      if (subject.client) {
        const stored = subject.client.documents.filter((document) =>
          String(document.conversationId ?? document._id).endsWith(
            "dm-kizilaykahve-sarahcodes"
          )
        );
        expect(stored.map((document) => document._type).sort()).toEqual([
          "conversation",
          "conversationMember",
          "conversationMember",
          "message",
        ]);
      }
    });

    it.runIf(name === "sanity")(
      "writes the conversation, its members and the greeting in one transaction",
      async () => {
        const before = transactions();
        await repo.messages.openDirect(sarah, kahve);
        expect(transactions() - before).toBe(1);
        await repo.messages.openDirect(sarah, kahve);
        expect(transactions() - before).toBe(1);
      }
    );

    it("finds existing conversations without ever writing", async () => {
      const snapshot = () =>
        subject.state
          ? JSON.stringify([
              [...subject.state.messages.conversations],
              [...subject.state.messages.members],
              [...subject.state.messages.messages],
            ])
          : JSON.stringify(subject.client!.documents);
      const before = snapshot();
      const log = transactions();

      expect(
        await repo.messages.findDirect(DEMO_USERNAME, "devmarco")
      ).toMatchObject({ id: SEEDED.marco, other: marco });
      expect(
        await repo.messages.findDirect(DEMO_USERNAME, "nightowl_dev")
      ).toBeNull();
      expect(
        await repo.messages.findDirect(DEMO_USERNAME, DEMO_USERNAME)
      ).toBeNull();
      expect(snapshot()).toBe(before);
      expect(transactions()).toBe(log);
    });
  });

  describe("text messages", () => {
    it("send, replay a retry once and refuse a reused key", async () => {
      await open();
      subject.clock.advance(MINUTE);
      const input = textInput(ALICE_BOB, alice, "Hello 👋");
      const before = transactions();
      const sent = await repo.messages.sendMessage(input);
      // Only the message is written: the conversation is never patched.
      if (subject.client) expect(transactions() - before).toBe(1);
      expect(input.operationId).toMatch(/^msg-[0-9a-f]{32}$/);
      expect(sent).toEqual({
        replayed: false,
        message: {
          id: input.operationId,
          conversationId: ALICE_BOB,
          author: alice,
          createdAt: at(MINUTE),
          body: { type: "text", text: "Hello 👋", tweet: null, story: null },
        },
      });

      subject.clock.advance(MINUTE);
      expect(await repo.messages.sendMessage(input)).toEqual({
        ...sent,
        replayed: true,
      });
      expect(transactions() - before).toBe(subject.client ? 1 : 0);
      await expect(
        repo.messages.sendMessage({
          ...input,
          text: "Something else",
          fingerprint: fingerprint({ text: "Something else" }),
        })
      ).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
      expect(await page(ALICE_BOB)).toEqual([sent.message]);

      expect(
        await repo.messages.getConversation(ALICE_BOB, "bob_test")
      ).toMatchObject({
        unread: 1,
        lastMessage: sent.message,
        updatedAt: sent.message.createdAt,
      });
      expect(await repo.messages.unreadConversations("bob_test")).toBe(1);
      expect(await repo.messages.unreadConversations("alice_test")).toBe(0);
    });

    it.runIf(name === "sanity")(
      "replay when an identical send commits first",
      async () => {
        await open();
        const input = textInput(ALICE_BOB, alice, "Twice?");
        const client = subject.client!;
        let competitors = 0;
        client.beforeMutate = async () => {
          if (competitors++ > 0) return;
          await repo.messages.sendMessage(input);
        };
        const result = await repo.messages.sendMessage(input);
        client.beforeMutate = undefined;

        expect(result.replayed).toBe(true);
        expect(await page(ALICE_BOB)).toEqual([result.message]);
      }
    );

    it("share Tweets, which read as gone once deleted", async () => {
      await open();
      const tweet = (await repo.getTweet("seed-t03"))!;
      const { message } = await repo.messages.sendMessage(
        textInput(ALICE_BOB, alice, "", { tweetId: "seed-t03" })
      );
      expect(message.body).toEqual({
        type: "text",
        text: "",
        tweet: { id: "seed-t03", author: lena, text: tweet.text },
        story: null,
      });

      await repo.deleteTweet("seed-t03");
      const [shared] = await page(ALICE_BOB);
      expect(shared.body).toMatchObject({ type: "text", tweet: null });

      await expect(
        repo.messages.sendMessage(
          textInput(ALICE_BOB, alice, "", { tweetId: "seed-t03" })
        )
      ).rejects.toBeInstanceOf(NotFoundError);
      subject.block("seed-t05");
      await expect(
        repo.messages.sendMessage(
          textInput(ALICE_BOB, alice, "Look", { tweetId: "seed-t05" })
        )
      ).rejects.toThrow("Tweet not found");
    });

    it("reply to stories while they last, and keep saying whose they were", async () => {
      await open();
      const story: IStory = {
        id: "story-test",
        author: sarah,
        content: {
          type: "text",
          text: "Hello from Ankara",
          background: "blue",
        },
        createdAt: SUBJECT_NOW.toISOString(),
        expiresAt: at(24 * 60 * MINUTE),
        viewer: { seen: true },
        views: null,
      };
      const input = textInput(ALICE_BOB, alice, "Nice!", { storyId: story.id });
      // The stories lane isn't built here: no story exists.
      await expect(repo.messages.sendMessage(input)).rejects.toThrow(
        "Story not found"
      );

      const getStory = vi
        .spyOn(repo.stories, "getStory")
        .mockImplementation(async (id) => (id === story.id ? story : null));
      const { message } = await repo.messages.sendMessage(input);
      expect(message.body).toEqual({
        type: "text",
        text: "Nice!",
        tweet: null,
        story: { id: story.id, author: sarah, preview: story.content },
      });
      expect(getStory).toHaveBeenCalledWith(story.id, "alice_test");

      getStory.mockResolvedValue(null);
      const [reply] = await page(ALICE_BOB, bob);
      expect(reply.body).toEqual({
        type: "text",
        text: "Nice!",
        tweet: null,
        story: { id: story.id, author: sarah, preview: null },
      });
    });
  });

  describe("membership", () => {
    it("keeps direct conversations to their two members", async () => {
      await open();
      await fund(carol);
      expect(
        await repo.messages.getConversation(ALICE_BOB, "carol_test")
      ).toBeNull();
      expect(await repo.messages.listConversations("carol_test")).toEqual([]);
      for (const conversationId of [
        ALICE_BOB,
        "dm-nobody-noone",
        "private.x",
        `dm-${"x".repeat(117)}`,
      ]) {
        await expect(
          repo.messages.listMessages(conversationId, "carol_test")
        ).rejects.toBeInstanceOf(NotFoundError);
      }
      for (const write of [
        () => repo.messages.sendMessage(textInput(ALICE_BOB, carol, "Hi")),
        () => repo.messages.sendPayment(paymentInput(ALICE_BOB, carol, 100)),
        () => repo.messages.sendRequest(requestInput(ALICE_BOB, carol, 100)),
      ]) {
        await expect(write()).rejects.toBeInstanceOf(NotFoundError);
      }
      await repo.messages.markRead(ALICE_BOB, "carol_test");
      expect(await page(ALICE_BOB)).toEqual([]);
      await expectLedgerInvariants(subject);
    });

    it("reads channels publicly but lets only members post, and never pay", async () => {
      const channel = "channel-test_room";
      addChannel(subject, channel, alice);
      await fund(alice);

      expect(
        await repo.messages.listMessages(channel, "bob_test")
      ).toMatchObject({ items: [], olderCursor: null, newestCursor: null });
      await expect(
        repo.messages.sendMessage(textInput(channel, bob, "Hi"))
      ).rejects.toBeInstanceOf(ForbiddenError);

      const { message } = await repo.messages.sendMessage(
        textInput(channel, alice, "Welcome")
      );
      expect((await page(channel, bob)).map((m) => m.id)).toEqual([message.id]);
      for (const write of [
        () => repo.messages.sendPayment(paymentInput(channel, alice, 100)),
        () => repo.messages.sendRequest(requestInput(channel, alice, 100)),
      ]) {
        await expect(write()).rejects.toThrow(
          new InvalidStateError(
            "Payments are only available in direct messages"
          )
        );
      }
      // Channels aren't direct conversations.
      expect(
        await repo.messages.getConversation(channel, "alice_test")
      ).toBeNull();
      expect(
        (await repo.messages.listConversations("alice_test")).map((c) => c.id)
      ).not.toContain(channel);
      expect(await balance(alice)).toBe(2_500);
    });
  });

  describe("paging", () => {
    it("pages by (createdAt, id) with stable cursors", async () => {
      await open();
      const sent: IMessage[] = [];
      for (let i = 0; i < 7; i++) {
        // Messages 3 and 4 share a timestamp: the id breaks the tie.
        if (i !== 4) subject.clock.advance(MINUTE);
        const from = i % 2 ? bob : alice;
        sent.push(
          (await repo.messages.sendMessage(textInput(ALICE_BOB, from, `m${i}`)))
            .message
        );
      }
      const all = await page(ALICE_BOB);
      expect(all).toHaveLength(7);
      expect(all.map((m) => m.id).sort()).toEqual(sent.map((m) => m.id).sort());
      const cursor = (message: IMessage) => encodeCursor(message);

      const newest = await repo.messages.listMessages(ALICE_BOB, "alice_test", {
        limit: 3,
      });
      expect(newest.items).toEqual(all.slice(4));
      expect(newest.newestCursor).toBe(cursor(all[6]));
      expect(newest.olderCursor).toBe(cursor(all[4]));
      expect(newest.serverNow).toBe(subject.clock.now().toISOString());

      const older = await repo.messages.listMessages(ALICE_BOB, "alice_test", {
        before: newest.olderCursor,
        limit: 3,
      });
      expect(older.items).toEqual(all.slice(1, 4));
      const oldest = await repo.messages.listMessages(ALICE_BOB, "alice_test", {
        before: older.olderCursor,
        limit: 3,
      });
      expect(oldest.items).toEqual(all.slice(0, 1));
      expect(oldest.olderCursor).toBeNull();

      // Polling from the newest cursor: nothing new keeps the same cursor.
      const idle = await repo.messages.listMessages(ALICE_BOB, "alice_test", {
        after: newest.newestCursor,
      });
      expect(idle).toMatchObject({
        items: [],
        newestCursor: newest.newestCursor,
      });

      subject.clock.advance(MINUTE);
      const later = [
        (await repo.messages.sendMessage(textInput(ALICE_BOB, bob, "n1")))
          .message,
        (await repo.messages.sendMessage(textInput(ALICE_BOB, bob, "n2")))
          .message,
      ].sort((a, b) => (a.id < b.id ? -1 : 1));
      const first = await repo.messages.listMessages(ALICE_BOB, "alice_test", {
        after: newest.newestCursor,
        limit: 1,
      });
      expect(first.items).toEqual([later[0]]);
      const second = await repo.messages.listMessages(ALICE_BOB, "alice_test", {
        after: first.newestCursor,
      });
      expect(second.items).toEqual([later[1]]);
      // The earlier pages didn't move.
      expect(
        (
          await repo.messages.listMessages(ALICE_BOB, "alice_test", {
            before: newest.olderCursor,
            limit: 3,
          })
        ).items
      ).toEqual(older.items);
    });
  });

  describe("read markers", () => {
    it("count unread messages and only ever move forward", async () => {
      await open();
      subject.clock.advance(MINUTE);
      await repo.messages.sendMessage(textInput(ALICE_BOB, bob, "One"));
      await repo.messages.sendMessage(textInput(ALICE_BOB, bob, "Two"));
      await repo.messages.sendMessage(textInput(ALICE_BOB, alice, "Hi"));
      const view = (viewer: string) =>
        repo.messages.getConversation(ALICE_BOB, viewer);
      expect((await view("alice_test"))!.unread).toBe(2);
      expect((await view("bob_test"))!.unread).toBe(1);
      expect(await repo.messages.unreadConversations("alice_test")).toBe(1);

      subject.clock.advance(MINUTE);
      await repo.messages.markRead(ALICE_BOB, "alice_test");
      expect((await view("alice_test"))!.unread).toBe(0);
      expect((await view("bob_test"))!.otherReadAt).toBe(at(2 * MINUTE));
      expect(await repo.messages.unreadConversations("alice_test")).toBe(0);

      // A slower request with an older clock can't move it back.
      const log = transactions();
      subject.clock.set(at(MINUTE));
      await repo.messages.markRead(ALICE_BOB, "alice_test");
      expect((await view("bob_test"))!.otherReadAt).toBe(at(2 * MINUTE));
      expect(transactions()).toBe(log);

      subject.clock.set(at(5 * MINUTE));
      await repo.messages.markRead(ALICE_BOB, "Alice_Test");
      expect((await view("bob_test"))!.otherReadAt).toBe(at(5 * MINUTE));
    });
  });

  describe("payments in chat", () => {
    it("pay the other member and post the payment in one write", async () => {
      await fund(alice);
      await open();
      subject.clock.advance(MINUTE);
      const input = paymentInput(ALICE_BOB, alice, 700, { note: "Lunch 🍝" });
      const before = transactions();

      const paid = await repo.messages.sendPayment(input);
      if (subject.client) expect(transactions() - before).toBe(1);
      expect(paid.replayed).toBe(false);
      expect(paid.transfer).toMatchObject({
        id: input.operationId,
        kind: "payment",
        from: alice,
        to: bob,
        amount: 700,
        note: "Lunch 🍝",
        context: { type: "conversation", id: ALICE_BOB },
        holdUntil: null,
      });
      expect(paid.message).toEqual({
        id: chatMessageId(input.operationId),
        conversationId: ALICE_BOB,
        author: alice,
        createdAt: paid.transfer.createdAt,
        body: {
          type: "payment",
          transferId: input.operationId,
          amount: 700,
          note: "Lunch 🍝",
        },
      });
      expect(paid.wallet).toEqual(await repo.wallet.getWallet("alice_test"));
      expect(paid.wallet.balance).toBe(1_800);
      expect(await balance(bob)).toBe(700);

      // A retry replays: no second transfer or bubble, nothing written.
      const log = transactions();
      expect(await repo.messages.sendPayment(input)).toEqual({
        ...paid,
        replayed: true,
      });
      expect(transactions()).toBe(log);
      await expect(
        repo.messages.sendPayment({
          ...input,
          amount: 800,
          fingerprint: fingerprint({ amount: 800 }),
        })
      ).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
      expect(await page(ALICE_BOB)).toEqual([paid.message]);
      expect(await balance(alice)).toBe(1_800);

      expect(
        await repo.messages.getConversation(ALICE_BOB, "bob_test")
      ).toMatchObject({ unread: 1, lastMessage: paid.message });
      expect(await repo.wallet.notifications("bob_test", 5)).toContainEqual(
        expect.objectContaining({
          id: `pay-${input.operationId}`,
          type: "payment",
          conversationId: ALICE_BOB,
        })
      );
      await expectLedgerInvariants(subject);
    });

    it("write nothing when the payment can't go through", async () => {
      await fund(alice, 2_500);
      await open();
      const log = transactions();
      const refused: [ChatMoneyInput, new (...args: never[]) => Error][] = [
        [paymentInput(ALICE_BOB, alice, 3_000), InsufficientFundsError],
        [paymentInput(ALICE_BOB, alice, 30), LimitExceededError],
        [paymentInput(ALICE_BOB, alice, 20_001), LimitExceededError],
      ];
      for (const [input, error] of refused) {
        await expect(repo.messages.sendPayment(input)).rejects.toBeInstanceOf(
          error
        );
      }
      subject.freeze("bob_test", true);
      const frozen = paymentInput(ALICE_BOB, alice, 100);
      await expect(repo.messages.sendPayment(frozen)).rejects.toBeInstanceOf(
        WalletFrozenError
      );

      expect(transactions()).toBe(log);
      expect(await page(ALICE_BOB)).toEqual([]);
      for (const input of [...refused.map(([input]) => input), frozen]) {
        expect(await repo.wallet.getTransfer(input.operationId)).toBeNull();
      }
      expect(await balance(alice)).toBe(2_500);
      await expectLedgerInvariants(subject);
    });

    it.runIf(name === "sanity")(
      "gives up after 3 conflicts without a partial write",
      async () => {
        await fund(alice);
        await open();
        const client = subject.client!;
        const input = paymentInput(ALICE_BOB, alice, 500);
        const log = transactions();

        client.injectConflicts(3);
        await expect(repo.messages.sendPayment(input)).rejects.toBeInstanceOf(
          ConflictError
        );
        expect(transactions()).toBe(log);
        expect(await page(ALICE_BOB)).toEqual([]);
        expect(await repo.wallet.getTransfer(input.operationId)).toBeNull();

        client.injectConflicts(2);
        await repo.messages.sendPayment(input);
        expect(transactions()).toBe(log + 1);
        expect(await page(ALICE_BOB)).toHaveLength(1);
        await expectLedgerInvariants(subject);
      }
    );
  });

  describe("requests in chat", () => {
    it("ask the other member, in one write, and show the request as it is now", async () => {
      await open();
      subject.clock.advance(MINUTE);
      const input = requestInput(ALICE_BOB, alice, 450, { note: "Coffee" });
      const before = transactions();

      const asked = await repo.messages.sendRequest(input);
      if (subject.client) expect(transactions() - before).toBe(1);
      expect(asked.request).toMatchObject({
        id: input.operationId,
        requester: alice,
        payer: bob,
        amount: 450,
        note: "Coffee",
        status: "pending",
        createdAt: at(MINUTE),
        conversationId: ALICE_BOB,
        transferId: null,
      });
      expect(asked.message).toEqual({
        id: chatMessageId(input.operationId),
        conversationId: ALICE_BOB,
        author: alice,
        createdAt: at(MINUTE),
        body: { type: "request", request: asked.request },
      });
      expect(await repo.wallet.getRequest(input.operationId)).toEqual(
        asked.request
      );

      const log = transactions();
      expect(await repo.messages.sendRequest(input)).toEqual({
        ...asked,
        replayed: true,
      });
      expect(transactions()).toBe(log);
      await expect(
        repo.messages.sendRequest({
          ...input,
          fingerprint: fingerprint({ amount: 999 }),
        })
      ).rejects.toBeInstanceOf(IdempotencyKeyReusedError);

      // Bob pays from his wallet; both members see it paid on their next read.
      await fund(bob);
      const pay = payInput(bob, asked.request.id);
      await repo.wallet.payRequest(pay);
      for (const viewer of [alice, bob]) {
        const [bubble] = await page(ALICE_BOB, viewer);
        expect(bubble.body).toMatchObject({
          type: "request",
          request: { status: "paid", transferId: pay.operationId },
        });
      }
      expect(await balance(alice)).toBe(450);
      await expectLedgerInvariants(subject);
    });

    it("keep the 10 pending requests limit, writing nothing past it", async () => {
      await open();
      for (let i = 0; i < 10; i++) {
        await repo.messages.sendRequest(
          requestInput(ALICE_BOB, alice, 100 + i)
        );
      }
      const log = transactions();
      const input = requestInput(ALICE_BOB, alice, 500);
      await expect(repo.messages.sendRequest(input)).rejects.toBeInstanceOf(
        LimitExceededError
      );
      subject.freeze("bob_test", true);
      await expect(
        repo.messages.sendRequest(requestInput(ALICE_BOB, bob, 500))
      ).rejects.toBeInstanceOf(WalletFrozenError);

      expect(transactions()).toBe(log);
      expect(await page(ALICE_BOB)).toHaveLength(10);
      expect(await repo.wallet.getRequest(input.operationId)).toBeNull();
      // No bubble either, even one the page would skip for want of its
      // request: it would still count as unread.
      expect(
        (await repo.messages.getConversation(ALICE_BOB, bob.username))!.unread
      ).toBe(10);
      expect(
        (await repo.messages.getConversation(ALICE_BOB, alice.username))!.unread
      ).toBe(0);
      if (subject.state) {
        expect(
          subject.state.messages.messages.has(chatMessageId(input.operationId))
        ).toBe(false);
      }
    });
  });

  describe("privacy", () => {
    it.runIf(name === "sanity")(
      "hides every conversation from anonymous reads and skips drafts",
      async () => {
        const client = subject.client!;
        const draft = client.documents.find(
          (document) => document._id === "private.seed-msg-marco-02"
        )!;
        client.documents.push({
          ...draft,
          _id: "drafts.private.seed-msg-marco-02",
          text: "A draft",
        });
        expect((await page(SEEDED.marco, me)).map((m) => m.id)).toEqual([
          "seed-msg-marco-01",
          "seed-msg-marco-02",
        ]);

        client.anonymous = true;
        expect(await repo.messages.listConversations(DEMO_USERNAME)).toEqual(
          []
        );
        expect(await repo.messages.unreadConversations(DEMO_USERNAME)).toBe(0);
        await expect(
          repo.messages.listMessages(SEEDED.marco, DEMO_USERNAME)
        ).rejects.toBeInstanceOf(NotFoundError);
      }
    );
  });
});

describe("memory message capacity", () => {
  it("drops the oldest text messages, never a payment or a request", async () => {
    let time = SUBJECT_NOW.getTime();
    let ids = 0;
    const state = createMemoryState(createSeedData(SUBJECT_NOW));
    const repo = createMemoryRepository(state, {
      now: () => new Date((time += MINUTE)),
      generateId: () => `new-${++ids}`,
      limits: { messages: 3 },
    });
    const kept = () => [...state.messages.messages.values()];
    const moneyBefore = kept().filter((m) => m.content.type !== "text");

    await repo.wallet.topUp(topUpInput(alice, 2_500));
    await repo.messages.openDirect(alice, bob);
    const first = textInput(ALICE_BOB, alice, "t1");
    await repo.messages.sendMessage(first);
    const paid = await repo.messages.sendPayment(
      paymentInput(ALICE_BOB, alice, 100)
    );
    await repo.messages.sendMessage(textInput(ALICE_BOB, alice, "t2"));
    const asked = await repo.messages.sendRequest(
      requestInput(ALICE_BOB, alice, 200)
    );
    await repo.messages.sendMessage(textInput(ALICE_BOB, bob, "t3"));
    await repo.messages.sendMessage(textInput(ALICE_BOB, bob, "t4"));

    const texts = kept().filter((m) => m.content.type === "text");
    expect(
      texts.map((m) => m.content.type === "text" && m.content.text)
    ).toEqual(["t2", "t3", "t4"]);
    expect(kept().filter((m) => m.content.type !== "text")).toEqual([
      ...moneyBefore,
      expect.objectContaining({ id: paid.message.id }),
      expect.objectContaining({ id: asked.message.id }),
    ]);
    expect(
      (await repo.messages.listMessages(ALICE_BOB, "alice_test")).items.map(
        (m) => m.body.type
      )
    ).toEqual(["payment", "text", "request", "text", "text"]);

    // Retrying an evicted text re-posts it (documented, harmless).
    expect((await repo.messages.sendMessage(first)).replayed).toBe(false);
    expect((await repo.wallet.audit()).ok).toBe(true);
  });
});

describe("stores agree on messages", () => {
  const read = async (repo: Repository) => ({
    demo: await repo.messages.listConversations(DEMO_USERNAME),
    sarah: await repo.messages.listConversations("sarahcodes"),
    kahve: await repo.messages.listConversations("kizilaykahve"),
    alice: await repo.messages.listConversations("alice_test"),
    unread: await Promise.all(
      [DEMO_USERNAME, "sarahcodes", "alice_test", "bob_test"].map((username) =>
        repo.messages.unreadConversations(username)
      )
    ),
    pages: await Promise.all(
      [...Object.values(SEEDED), ALICE_BOB].map(async (id) => {
        try {
          return await repo.messages.listMessages(id, DEMO_USERNAME, {
            limit: 2,
          });
        } catch (error) {
          return String(error);
        }
      })
    ),
    alicePage: await repo.messages
      .listMessages(ALICE_BOB, "alice_test")
      .catch(String),
    found: await repo.messages.findDirect("devmarco", DEMO_USERNAME),
  });

  it("for seeded reads", async () => {
    await expectStoresAgree(read);
  });

  it("after opens, messages, payments, requests and read markers", async () => {
    await expectStoresAgree(read, {
      prepare: async ({ repo, clock }) => {
        await repo.wallet.topUp(topUpInput(alice, 2_500));
        await repo.messages.openDirect(alice, bob);
        await repo.messages.openDirect(sarah, kahve);
        clock.advance(MINUTE);
        await repo.messages.sendMessage(
          textInput(ALICE_BOB, alice, "Hey", { key: "k-1" })
        );
        await repo.messages.sendMessage(
          textInput(ALICE_BOB, bob, "", { key: "k-2", tweetId: "seed-t01" })
        );
        clock.advance(MINUTE);
        await repo.messages.sendPayment(
          paymentInput(ALICE_BOB, alice, 300, { key: "k-3", note: "Taxi" })
        );
        await repo.messages.sendRequest(
          requestInput(ALICE_BOB, bob, 150, { key: "k-4" })
        );
        await repo.messages.sendPayment(
          paymentInput(SEEDED.sarah, me, 450, { key: "k-5" })
        );
        clock.advance(MINUTE);
        await repo.messages.markRead(ALICE_BOB, "bob_test");
        await repo.messages.markRead(SEEDED.sarah, DEMO_USERNAME);
      },
    });
  });
});
