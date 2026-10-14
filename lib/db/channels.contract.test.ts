import { readFileSync } from "fs";
import { beforeEach, describe, expect, it } from "vitest";

import {
  expectLedgerInvariants,
  expectStoresAgree,
  Subject,
  SUBJECT_NOW,
  subjects,
} from "../../test/repositorySubjects";
import { IChannel } from "../../types/Message";
import { IAuthor } from "../../types/User";
import { fingerprint, operationId } from "../superapp/idempotency";
import { LIMITS } from "../superapp/limits";
import {
  channelConversationId,
  CHANNEL_HANDLE_PATTERN,
} from "../superapp/messages";
import {
  ConflictError,
  ForbiddenError,
  InvalidStateError,
  LimitExceededError,
  NotFoundError,
} from "./errors";
import { NewChannel, NewMessage } from "./messages/types";
import { createSeedData, DEMO_USERNAME } from "./seed";
import { Repository } from "./types";

// Channels on both stores: the seeded channels, creating them (a handle is
// taken once, 3 per person), joining and leaving, roles, removing
// messages, and posting through the messages engine. Fresh accounts
// (alice_test, ...) keep assertions independent of later lanes' seeds.

const MINUTE = 60_000;

const person = (username: string, fullname: string): IAuthor => ({
  username,
  fullname,
  image: `/avatars/${username}.svg`,
});
const me = person(DEMO_USERNAME, "Ilhan Ozkan");
const superapp = person("superapp", "Twitter SuperApp");
const marco = person("devmarco", "Marco Rossi");
const foodie = person("foodie_ankara", "Mert Demir");
const fresh = (username: string): IAuthor => ({
  username,
  fullname: username.replace("_test", " Test"),
  image: null,
});
const alice = fresh("alice_test");
const bob = fresh("bob_test");
const carol = fresh("carol_test");

const BUILDERS = "superapp_builders";
const EATS = "ankara_eats";

let keys = 0;

/** A text message as the channel route builds it. */
const textInput = (
  handle: string,
  author: IAuthor,
  text: string,
  key = `channel-key-${++keys}`
): NewMessage => {
  const conversationId = channelConversationId(handle);
  return {
    operationId: operationId("msg", author.username, "messages.send", key),
    fingerprint: fingerprint({
      conversationId,
      text,
      tweetId: null,
      storyId: null,
    }),
    conversationId,
    author,
    text,
    tweetId: null,
    storyId: null,
  };
};

const newChannel = (
  owner: IAuthor,
  handle: string,
  overrides: Partial<NewChannel> = {}
): NewChannel => ({
  owner,
  handle,
  name: `Room ${handle}`,
  description: null,
  ...overrides,
});

describe.each(subjects())("%s channels", (name, create) => {
  let subject: Subject;
  let repo: Repository;

  const transactions = () => subject.client?.mutationLog.length ?? 0;
  const handles = (channels: IChannel[]) => channels.map((c) => c.handle);
  const page = async (handle: string, viewer: string) =>
    (
      await repo.messages.listMessages(channelConversationId(handle), viewer, {
        limit: 50,
      })
    ).items;
  /** Every read at the same instant first, then every write (Sanity). */
  const concurrently = async <T>(writes: (() => Promise<T>)[]) => {
    if (subject.client) {
      subject.client.fetchDelay = () =>
        new Promise((resolve) => setImmediate(resolve));
    }
    try {
      return await Promise.allSettled(writes.map((write) => write()));
    } finally {
      if (subject.client) subject.client.fetchDelay = undefined;
    }
  };

  beforeEach(() => {
    subject = create();
    repo = subject.repo;
  });

  it("is on wherever messages are", () => {
    expect(repo.channels.implemented).toBe(true);
    expect(repo.featureStatus("channels")).toBe("on");
  });

  describe("seeded channels", () => {
    it("show #superapp_builders, which the demo user moderates", async () => {
      const channel = await repo.channels.getChannel(BUILDERS, DEMO_USERNAME);
      expect(channel).toMatchObject({
        id: "channel-superapp_builders",
        kind: "channel",
        handle: BUILDERS,
        name: "SuperApp builders",
        owner: superapp,
        memberCount: 5,
        viewer: { role: "moderator", unread: 1 },
        lastMessage: {
          id: "seed-msg-sab-06",
          author: superapp,
          body: { type: "text" },
        },
      });
      expect(channel!.description).toMatch(/^Roadmap/);

      const messages = await page(BUILDERS, DEMO_USERNAME);
      expect(messages.map((m) => m.id)).toEqual([
        "seed-msg-sab-01",
        "seed-msg-sab-02",
        "seed-msg-sab-03",
        "seed-msg-sab-04",
        "seed-msg-sab-05",
        "seed-msg-sab-06",
      ]);
      expect(messages[3]).toMatchObject({ author: marco });
    });

    it("show #ankara_eats, which the demo user hasn't joined", async () => {
      expect(await repo.channels.getChannel(EATS, DEMO_USERNAME)).toMatchObject(
        {
          handle: EATS,
          name: "Ankara eats",
          owner: foodie,
          memberCount: 4,
          viewer: { role: null, unread: 0 },
        }
      );
      expect(
        (await repo.channels.listMembers(EATS)).map(
          ({ user, role }) => `${role}:${user.username}`
        )
      ).toEqual([
        "owner:foodie_ankara",
        "member:ayse_design",
        "member:kizilaykahve",
        "member:lahmacunlab",
      ]);
    });

    it("leave the ledger alone", async () => {
      await expectLedgerInvariants(subject);
    });

    it("are not direct conversations", async () => {
      const inbox = await repo.messages.listConversations(DEMO_USERNAME);
      expect(inbox.every((c) => c.kind === "direct")).toBe(true);
      expect(await repo.messages.unreadConversations(DEMO_USERNAME)).toBe(1);
    });
  });

  describe("listing", () => {
    it("lists yours by activity and Discover by size", async () => {
      subject.clock.advance(MINUTE);
      await repo.channels.createChannel(newChannel(me, "quiet_room"));

      expect(
        handles(
          await repo.channels.listChannels(
            { member: "IlllhanOzkan" },
            DEMO_USERNAME
          )
        )
      ).toEqual(["quiet_room", BUILDERS]);

      const discover = await repo.channels.listChannels({}, DEMO_USERNAME);
      expect(handles(discover).slice(0, 2)).toEqual([BUILDERS, EATS]);
      expect(handles(discover)).toContain("quiet_room");
      expect(discover.find((c) => c.handle === EATS)!.viewer).toEqual({
        role: null,
        unread: 0,
      });
    });

    it("searches handles, names and descriptions by word prefixes", async () => {
      const search = async (query: string) =>
        handles(await repo.channels.listChannels({ search: query }, null));
      expect(await search("eats")).toEqual([EATS]);
      expect(await search("Builders")).toEqual([BUILDERS]);
      expect(await search("late-night food")).toEqual([EATS]);
      expect(await search("ankara_e")).toEqual([EATS]);
      expect(await search("nothing here")).toEqual([]);
      expect(await search("!!!")).toEqual([]);
      // Blank searches are ignored.
      expect((await search("  ")).length).toBeGreaterThanOrEqual(2);
    });

    it("reads anonymously, with no role", async () => {
      const channel = await repo.channels.getChannel(BUILDERS, null);
      expect(channel?.viewer).toEqual({ role: null, unread: 0 });
      expect(await repo.channels.getChannel("no_such_room", null)).toBeNull();
      expect(await repo.channels.getChannel("Not A Handle", null)).toBeNull();
    });
  });

  describe("createChannel", () => {
    it("creates a channel its creator owns", async () => {
      const channel = await repo.channels.createChannel(
        newChannel(alice, "alice_room", {
          name: "Alice's room",
          description: "Tea and code",
        })
      );
      expect(channel).toEqual({
        id: "channel-alice_room",
        kind: "channel",
        handle: "alice_room",
        name: "Alice's room",
        description: "Tea and code",
        owner: alice,
        memberCount: 1,
        lastMessage: null,
        createdAt: SUBJECT_NOW.toISOString(),
        viewer: { role: "owner", unread: 0 },
      });
      expect(await repo.channels.listMembers("alice_room")).toEqual([
        { user: alice, role: "owner" },
      ]);
      expect(await repo.channels.getChannel("alice_room", "bob_test")).toEqual({
        ...channel,
        viewer: { role: null, unread: 0 },
      });
    });

    it("takes a handle once", async () => {
      await repo.channels.createChannel(newChannel(alice, "taken_room"));
      await expect(
        repo.channels.createChannel(newChannel(bob, "taken_room"))
      ).rejects.toThrow(new ConflictError("That handle is taken"));
      await expect(
        repo.channels.createChannel(newChannel(bob, BUILDERS))
      ).rejects.toBeInstanceOf(ConflictError);
      expect(
        (await repo.channels.getChannel("taken_room", null))!.owner
      ).toEqual(alice);
    });

    it("takes a handle exactly once under concurrent creates", async () => {
      const results = await concurrently(
        [alice, bob, carol].map(
          (owner) => () =>
            repo.channels.createChannel(newChannel(owner, "race_room"))
        )
      );
      const won = results.filter((result) => result.status === "fulfilled");
      expect(won).toHaveLength(1);
      for (const result of results) {
        if (result.status === "rejected") {
          expect(result.reason).toBeInstanceOf(ConflictError);
        }
      }
      const winner = (won[0] as PromiseFulfilledResult<IChannel>).value.owner;
      expect(await repo.channels.listMembers("race_room")).toEqual([
        { user: winner, role: "owner" },
      ]);
    });

    it(`lets each person create ${LIMITS.channels.createdPerUser}`, async () => {
      for (const handle of ["room_one", "room_two", "room_three"]) {
        await repo.channels.createChannel(newChannel(alice, handle));
      }
      const before = transactions();
      await expect(
        repo.channels.createChannel(
          newChannel({ ...alice, username: "Alice_Test" }, "room_four")
        )
      ).rejects.toThrow(
        new LimitExceededError("You can create up to 3 channels")
      );
      expect(transactions()).toBe(before);
      expect(await repo.channels.getChannel("room_four", null)).toBeNull();
      // Joining other channels doesn't count.
      await repo.channels.setMembership(EATS, bob, true);
      await repo.channels.createChannel(newChannel(bob, "bob_room"));
    });

    it.runIf(name === "sanity")(
      "writes the channel and its owner in one transaction",
      async () => {
        const before = transactions();
        await repo.channels.createChannel(newChannel(alice, "one_write"));
        expect(transactions() - before).toBe(1);
        const ids = subject
          .client!.documents.filter((document) =>
            String(document._id).includes("one_write")
          )
          .map((document) => document._id)
          .sort();
        expect(ids).toEqual([
          "private.channel-one_write",
          "private.member-channel-one_write-alice_test",
        ]);
      }
    );
  });

  describe("membership", () => {
    it("joins and leaves idempotently", async () => {
      const joined = await repo.channels.setMembership(EATS, me, true);
      expect(joined).toMatchObject({
        changed: true,
        channel: { memberCount: 5, viewer: { role: "member", unread: 0 } },
      });
      expect((await repo.channels.setMembership(EATS, me, true)).changed).toBe(
        false
      );
      expect(
        handles(
          await repo.channels.listChannels(
            { member: DEMO_USERNAME },
            DEMO_USERNAME
          )
        )
      ).toContain(EATS);

      const left = await repo.channels.setMembership(EATS, me, false);
      expect(left).toMatchObject({
        changed: true,
        channel: { memberCount: 4, viewer: { role: null, unread: 0 } },
      });
      expect((await repo.channels.setMembership(EATS, me, false)).changed).toBe(
        false
      );
    });

    it("never lets the owner leave", async () => {
      await expect(
        repo.channels.setMembership(BUILDERS, superapp, false)
      ).rejects.toThrow(
        new InvalidStateError("The owner can't leave their channel")
      );
      expect(
        (await repo.channels.getChannel(BUILDERS, "superapp"))!.viewer.role
      ).toBe("owner");
    });

    it("answers NotFound for unknown channels", async () => {
      for (const write of [
        () => repo.channels.setMembership("no_such_room", alice, true),
        () => repo.channels.setRole("no_such_room", "alice_test", "member"),
        () => repo.channels.listMembers("no_such_room"),
      ]) {
        await expect(write()).rejects.toBeInstanceOf(NotFoundError);
      }
    });

    it("counts what members haven't read since they joined", async () => {
      await repo.channels.setMembership(EATS, alice, true);
      subject.clock.advance(MINUTE);
      await repo.messages.sendMessage(textInput(EATS, foodie, "Lunch?"));
      expect(
        (await repo.channels.getChannel(EATS, "alice_test"))!.viewer.unread
      ).toBe(1);

      subject.clock.advance(MINUTE);
      await repo.messages.markRead(channelConversationId(EATS), "alice_test");
      expect(
        (await repo.channels.getChannel(EATS, "alice_test"))!.viewer.unread
      ).toBe(0);
      // Your own messages are never unread.
      await repo.messages.sendMessage(textInput(EATS, alice, "Yes!"));
      expect(
        (await repo.channels.getChannel(EATS, "alice_test"))!.viewer.unread
      ).toBe(0);
    });
  });

  describe("posting", () => {
    it("reads publicly, posts for members only and never pays", async () => {
      expect((await page(EATS, DEMO_USERNAME)).length).toBe(4);
      await expect(
        repo.messages.sendMessage(textInput(EATS, me, "Hello"))
      ).rejects.toThrow(
        new ForbiddenError("Join this channel to send messages")
      );

      await repo.channels.setMembership(EATS, me, true);
      const { message } = await repo.messages.sendMessage(
        textInput(EATS, me, "Hello")
      );
      expect((await page(EATS, "nightowl_dev")).at(-1)).toEqual(message);
      expect((await repo.channels.getChannel(EATS, null))!.lastMessage).toEqual(
        message
      );

      const conversationId = channelConversationId(EATS);
      for (const write of [
        () =>
          repo.messages.sendPayment({
            operationId: "tx-channel-payment",
            fingerprint: "f",
            conversationId,
            from: me,
            amount: 100,
            note: null,
          }),
        () =>
          repo.messages.sendRequest({
            operationId: "req-channel-request",
            fingerprint: "f",
            conversationId,
            from: me,
            amount: 100,
            note: null,
          }),
      ]) {
        await expect(write()).rejects.toThrow(
          new InvalidStateError(
            "Payments are only available in direct messages"
          )
        );
      }
      await expectLedgerInvariants(subject);

      // Leaving takes posting away again.
      await repo.channels.setMembership(EATS, me, false);
      await expect(
        repo.messages.sendMessage(textInput(EATS, me, "Bye"))
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("roles", () => {
    it("makes and unmakes moderators, never touching the owner", async () => {
      await repo.channels.setMembership(EATS, alice, true);
      const promoted = await repo.channels.setRole(
        EATS,
        "Alice_Test",
        "moderator"
      );
      expect(promoted).toMatchObject({
        handle: EATS,
        viewer: { role: "owner" },
      });
      expect(
        (await repo.channels.getChannel(EATS, "alice_test"))!.viewer.role
      ).toBe("moderator");
      expect(
        (await repo.channels.listMembers(EATS)).map(
          ({ user, role }) => `${role}:${user.username}`
        )
      ).toEqual([
        "owner:foodie_ankara",
        "moderator:alice_test",
        "member:ayse_design",
        "member:kizilaykahve",
        "member:lahmacunlab",
      ]);

      // Setting the same role again is harmless.
      await repo.channels.setRole(EATS, "alice_test", "moderator");
      await repo.channels.setRole(EATS, "alice_test", "member");
      expect(
        (await repo.channels.getChannel(EATS, "alice_test"))!.viewer.role
      ).toBe("member");

      await expect(
        repo.channels.setRole(EATS, "foodie_ankara", "member")
      ).rejects.toThrow(new ForbiddenError("The owner's role can't change"));
      await expect(
        repo.channels.setRole(EATS, "bob_test", "moderator")
      ).rejects.toThrow(new NotFoundError("Member not found"));
    });
  });

  describe("removing messages", () => {
    it("marks a message removed, once, for every reader", async () => {
      const ref = await repo.channels.findMessage!(BUILDERS, "seed-msg-sab-04");
      expect(ref).toEqual({
        id: "seed-msg-sab-04",
        author: marco,
        removed: null,
      });

      expect(
        await repo.channels.removeMessage("seed-msg-sab-04", "moderator")
      ).toBe(true);
      expect(
        await repo.channels.removeMessage("seed-msg-sab-04", "author")
      ).toBe(false);
      const [removed] = (await page(BUILDERS, "nightowl_dev")).filter(
        (m) => m.id === "seed-msg-sab-04"
      );
      expect(removed).toEqual({
        id: "seed-msg-sab-04",
        conversationId: "channel-superapp_builders",
        author: marco,
        createdAt: removed.createdAt,
        body: { type: "removed", by: "moderator" },
      });
      expect(
        await repo.channels.findMessage!(BUILDERS, "seed-msg-sab-04")
      ).toMatchObject({ removed: "moderator" });
    });

    it("says when an author deleted their own message", async () => {
      await repo.channels.setMembership(EATS, alice, true);
      const { message } = await repo.messages.sendMessage(
        textInput(EATS, alice, "Oops, wrong channel")
      );
      await repo.channels.removeMessage(message.id, "author");
      expect(
        (await repo.channels.getChannel(EATS, "alice_test"))!.lastMessage
      ).toMatchObject({
        id: message.id,
        body: { type: "removed", by: "author" },
      });
    });

    it("removes once under concurrent requests", async () => {
      const results = await concurrently(
        [0, 1, 2].map(
          () => () => repo.channels.removeMessage("seed-msg-ae-02", "moderator")
        )
      );
      expect(
        results.map((result) => result.status === "fulfilled" && result.value)
      ).toEqual(expect.arrayContaining([true, false, false]));
    });

    it("only finds and removes channel messages", async () => {
      expect(
        await repo.channels.findMessage!(EATS, "seed-msg-sab-04")
      ).toBeNull();
      expect(await repo.channels.findMessage!(BUILDERS, "nope")).toBeNull();
      for (const id of ["seed-msg-marco-02", "no-such-message", "bad.id"]) {
        await expect(
          repo.channels.removeMessage(id, "moderator")
        ).rejects.toBeInstanceOf(NotFoundError);
      }
      // Direct messages stay as they were.
      const [, reply] = (
        await repo.messages.listMessages(
          "dm-devmarco-illlhanozkan",
          DEMO_USERNAME
        )
      ).items;
      expect(reply.body.type).toBe("text");
    });
  });

  describe("privacy", () => {
    it.runIf(name === "sanity")(
      "keeps channels away from anonymous reads and skips drafts",
      async () => {
        const client = subject.client!;
        const stored = client.documents.find(
          (document) => document._id === "private.channel-ankara_eats"
        )!;
        client.documents.push({
          ...stored,
          _id: "drafts.private.channel-ankara_eats",
          name: "A draft name",
        });
        expect((await repo.channels.getChannel(EATS, null))!.name).toBe(
          "Ankara eats"
        );

        client.anonymous = true;
        expect(await repo.channels.listChannels({}, null)).toEqual([]);
        expect(await repo.channels.getChannel(EATS, null)).toBeNull();
      }
    );
  });
});

describe("channel rules", () => {
  it("keeps the Studio's handle rule equal to the app's", () => {
    const schema = readFileSync("sanity/schemaTypes/messages.ts", "utf8");
    const match = schema.match(
      /export const CHANNEL_HANDLE_PATTERN = (\/.+\/);/
    );
    expect(match?.[1]).toBe(String(CHANNEL_HANDLE_PATTERN));
  });

  it("seeds both channels with members that exist", () => {
    const seed = createSeedData(SUBJECT_NOW).superapp!.messages!;
    const channels = seed.conversations.filter((c) => c.kind === "channel");
    expect(channels.map((c) => c.channel?.handle)).toEqual([BUILDERS, EATS]);
    for (const channel of channels) {
      expect(channel.id).toBe(channelConversationId(channel.channel!.handle));
      expect(channel.channel!.handle).toMatch(CHANNEL_HANDLE_PATTERN);
      const owners = seed.members.filter(
        (m) => m.conversationId === channel.id && m.role === "owner"
      );
      expect(owners.map((m) => m.user)).toEqual([channel.channel!.owner]);
    }
    // No link (mention, hashtag or URL) in a channel message's text.
    for (const message of seed.messages) {
      if (!message.conversationId.startsWith("channel-")) continue;
      expect(
        message.content.type === "text" && message.content.text,
        message.id
      ).not.toMatch(/[@#]\w|https?:/);
    }
  });
});

describe("stores agree on channels", () => {
  const read = async (repo: Repository) => ({
    discover: await repo.channels.listChannels({}, DEMO_USERNAME),
    mine: await repo.channels.listChannels(
      { member: DEMO_USERNAME },
      DEMO_USERNAME
    ),
    alice: await repo.channels.listChannels({ member: "alice_test" }, null),
    search: await repo.channels.listChannels({ search: "ank eat" }, "bob_test"),
    members: await Promise.all(
      [BUILDERS, EATS].map((handle) => repo.channels.listMembers(handle))
    ),
    pages: await Promise.all(
      [BUILDERS, EATS].map((handle) =>
        repo.messages.listMessages(channelConversationId(handle), "bob_test", {
          limit: 3,
        })
      )
    ),
  });

  it("for seeded reads", async () => {
    await expectStoresAgree(read);
  });

  it("after creating, joining, posting, roles and removals", async () => {
    await expectStoresAgree(read, {
      prepare: async ({ repo, clock }) => {
        await repo.channels.createChannel(
          newChannel(alice, "alice_room", { description: "Tea" })
        );
        clock.advance(MINUTE);
        await repo.channels.setMembership("alice_room", bob, true);
        await repo.channels.setMembership(EATS, alice, true);
        await repo.channels.setMembership(BUILDERS, me, false);
        clock.advance(MINUTE);
        await repo.messages.sendMessage(
          textInput("alice_room", bob, "First!", "agree-1")
        );
        await repo.channels.setRole("alice_room", "bob_test", "moderator");
        await repo.channels.removeMessage("seed-msg-ae-03", "moderator");
        clock.advance(MINUTE);
        await repo.messages.markRead(
          channelConversationId("alice_room"),
          "alice_test"
        );
      },
    });
  });
});
