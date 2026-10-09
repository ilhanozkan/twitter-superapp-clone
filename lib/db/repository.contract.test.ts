import { beforeEach, describe, expect, it } from "vitest";

import {
  expectStoresAgree,
  Subject,
  SUBJECT_NOW,
  subjects,
} from "../../test/repositorySubjects";
import { INotification } from "../../types/Notification";
import { NotFoundError } from "./errors";
import { DEMO_USERNAME } from "./seed";
import { Repository } from "./types";

// Both data sources must behave identically; every test below runs against
// the in-memory store and the Sanity repository (real GROQ via groq-js),
// on the core world: the data the app had before the SuperApp features.
const NOW = SUBJECT_NOW;
const factories = subjects({ world: "core" });

/** The Tweet a notification is about, for the kinds that have one. */
const tweetIdOf = (notification: INotification) =>
  "tweet" in notification ? notification.tweet?.id : undefined;

const me = {
  username: DEMO_USERNAME,
  fullname: "Ilhan Ozkan",
  image: "/avatars/illlhanozkan.svg",
};
const stranger = { username: "newcomer", fullname: "New Comer", image: null };

describe.each(factories)("%s repository", (_name, create) => {
  let repo: Repository;
  let block: Subject["block"];

  beforeEach(() => {
    ({ repo, block } = create());
  });

  describe("listTweets", () => {
    it("returns visible tweets newest first and hides moderated ones", async () => {
      const { items, nextCursor } = await repo.listTweets();

      expect(items).toHaveLength(20);
      expect(nextCursor).toBeNull();
      expect(items[0].id).toBe("seed-t01");
      expect(items.map((tweet) => tweet.id)).not.toContain("seed-t99");

      const times = items.map((tweet) => Date.parse(tweet.createdAt));
      expect([...times].sort((a, b) => b - a)).toEqual(times);
    });

    it("pages with cursors without gaps or duplicates", async () => {
      const ids: string[] = [];
      let cursor: string | null = null;
      let pages = 0;

      do {
        const page = await repo.listTweets({ limit: 7, cursor });
        ids.push(...page.items.map((tweet) => tweet.id));
        cursor = page.nextCursor;
        pages += 1;
      } while (cursor && pages < 10);

      expect(pages).toBe(3);
      expect(new Set(ids).size).toBe(20);
      expect(ids).toEqual(
        (await repo.listTweets({ limit: 50 })).items.map((t) => t.id)
      );
    });

    it("clamps the page size", async () => {
      expect((await repo.listTweets({ limit: 0 })).items).toHaveLength(1);
      expect((await repo.listTweets({ limit: 2.9 })).items).toHaveLength(2);
    });

    it("ignores cursors it did not produce", async () => {
      const { items } = await repo.listTweets({ cursor: "not-a-cursor" });
      expect(items[0].id).toBe("seed-t01");
    });

    it("reports stats and the viewer's own reactions", async () => {
      const { items } = await repo.listTweets({ viewer: "ILLLHANOZKAN" });
      const byId = new Map(items.map((tweet) => [tweet.id, tweet]));

      expect(byId.get("seed-t01")!.stats).toEqual({
        replies: 2,
        retweets: 2,
        likes: 6,
        tips: 0,
      });
      expect(byId.get("seed-t01")!.viewer).toEqual({
        liked: false,
        retweeted: true,
        bookmarked: false,
        tipped: false,
      });
      expect(byId.get("seed-t02")!.viewer.liked).toBe(true);
      expect(byId.get("seed-t04")!.viewer.bookmarked).toBe(true);
    });

    it("has no viewer state for anonymous requests", async () => {
      const { items } = await repo.listTweets();
      expect(
        items.every(
          (t) => !t.viewer.liked && !t.viewer.retweeted && !t.viewer.bookmarked
        )
      ).toBe(true);
    });

    it("filters by author case-insensitively", async () => {
      const { items } = await repo.listTweets({ author: "IlLlHaNoZkAn" });
      expect(items.map((t) => t.id)).toEqual([
        "seed-t05",
        "seed-t12",
        "seed-t19",
      ]);
    });

    it("searches text, usernames and names", async () => {
      expect(
        (await repo.listTweets({ search: "dolomites" })).items.map((t) => t.id)
      ).toEqual(["seed-t03"]);
      expect(
        (await repo.listTweets({ search: "Marco" })).items.map((t) => t.id)
      ).toEqual(["seed-t04", "seed-t11", "seed-t18"]);
      expect((await repo.listTweets({ search: "   " })).items).toHaveLength(20);
    });

    it("matches whole words by prefix, ignoring punctuation (like GROQ match)", async () => {
      const ids = async (search: string) =>
        (await repo.listTweets({ search, limit: 50 })).items.map((t) => t.id);

      expect(await ids("app")).toEqual(["seed-t09"]); // "apps", not "SuperApp"
      expect(await ids("@devmarco")).toEqual([
        "seed-t04",
        "seed-t11",
        "seed-t18",
      ]);
      expect(await ids("#SuperApp")).toEqual([
        "seed-t01",
        "seed-t05",
        "seed-t06",
        "seed-t12",
        "seed-t15",
        "seed-t19",
      ]);
      expect(await ids("downtime zero")).toEqual(["seed-t18"]);
      expect(await ids("Rossi Marco")).toEqual([
        "seed-t04",
        "seed-t11",
        "seed-t18",
      ]);
      expect(await ids("nightowl_dev")).toEqual(["seed-t07", "seed-t14"]);
      expect(await ids("!!!")).toEqual([]);
    });

    it("lists a user's bookmarks and likes", async () => {
      expect(
        (await repo.listTweets({ bookmarkedBy: DEMO_USERNAME })).items.map(
          (t) => t.id
        )
      ).toEqual(["seed-t04", "seed-t11", "seed-t17"]);
      expect(
        (await repo.listTweets({ likedBy: DEMO_USERNAME })).items.map(
          (t) => t.id
        )
      ).toEqual(["seed-t02", "seed-t03", "seed-t09", "seed-t15"]);
    });
  });

  describe("getTweet", () => {
    it("returns a tweet with viewer state", async () => {
      const tweet = await repo.getTweet("seed-t03", DEMO_USERNAME);
      expect(tweet).toMatchObject({
        id: "seed-t03",
        image: "/media/mountains.svg",
        author: {
          username: "lenaframes",
          fullname: "Lena Hoffmann",
          image: "/avatars/lenaframes.svg",
        },
        stats: { replies: 1, retweets: 1, likes: 5 },
        viewer: { liked: true, retweeted: false, bookmarked: false },
      });
    });

    it("returns null for missing and moderated tweets", async () => {
      expect(await repo.getTweet("nope")).toBeNull();
      expect(await repo.getTweet("seed-t99")).toBeNull();
    });
  });

  describe("createTweet / deleteTweet", () => {
    it("adds a tweet at the top of the timeline", async () => {
      const created = await repo.createTweet({
        text: "Hello from a test",
        image: null,
        author: me,
      });

      expect(created).toMatchObject({
        text: "Hello from a test",
        image: null,
        createdAt: NOW.toISOString(),
        author: me,
        stats: { replies: 0, retweets: 0, likes: 0 },
      });
      expect((await repo.listTweets({ limit: 1 })).items[0].id).toBe(
        created.id
      );
      expect((await repo.getUser(DEMO_USERNAME))!.tweetCount).toBe(4);
    });

    it("deletes a tweet together with its replies and reactions", async () => {
      expect(await repo.deleteTweet("seed-t05")).toBe(true);

      expect(await repo.getTweet("seed-t05")).toBeNull();
      expect(await repo.listReplies("seed-t05")).toEqual([]);
      expect(
        (await repo.listTweets({ likedBy: "sarahcodes" })).items.map(
          (t) => t.id
        )
      ).not.toContain("seed-t05");
      const notifications = await repo.listNotifications(DEMO_USERNAME);
      expect(notifications.some((n) => tweetIdOf(n) === "seed-t05")).toBe(
        false
      );

      expect(await repo.deleteTweet("seed-t05")).toBe(false);
    });
  });

  describe("deleteTweet scope", () => {
    it("never deletes documents that are not tweets", async () => {
      expect(await repo.deleteTweet("seed-r01")).toBe(false);
      expect(await repo.deleteTweet("user-sarahcodes")).toBe(false);
      expect(await repo.deleteTweet("like-seed-t01-sarahcodes")).toBe(false);

      expect((await repo.listReplies("seed-t01")).map((r) => r.id)).toContain(
        "seed-r01"
      );
      expect(await repo.getUser("sarahcodes")).not.toBeNull();
      expect((await repo.getTweet("seed-t01"))!.stats.likes).toBe(6);
    });
  });

  describe("replies", () => {
    it("lists replies oldest first", async () => {
      const replies = await repo.listReplies("seed-t12");
      expect(replies.map((r) => r.id)).toEqual([
        "seed-r05",
        "seed-r06",
        "seed-r07",
      ]);
      expect(replies[0]).toMatchObject({
        tweetId: "seed-t12",
        text: "💸 payments, obviously",
        author: { username: "nightowl_dev", fullname: "Priya Nair" },
      });
    });

    it("creates a reply and counts it", async () => {
      const reply = await repo.createReply({
        tweetId: "seed-t20",
        text: "Can't wait!",
        author: me,
      });

      expect(reply).toMatchObject({
        tweetId: "seed-t20",
        text: "Can't wait!",
        author: me,
      });
      expect((await repo.listReplies("seed-t20")).map((r) => r.id)).toEqual([
        reply.id,
      ]);
      expect((await repo.getTweet("seed-t20"))!.stats.replies).toBe(1);
    });

    it("refuses to reply to missing or moderated tweets", async () => {
      await expect(
        repo.createReply({ tweetId: "nope", text: "?", author: me })
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        repo.createReply({ tweetId: "seed-t99", text: "?", author: me })
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("setReaction", () => {
    it("is idempotent in both directions", async () => {
      await repo.setReaction("like", "seed-t20", me, true);
      await repo.setReaction(
        "like",
        "seed-t20",
        { ...me, username: me.username.toUpperCase() },
        true
      );

      let tweet = await repo.getTweet("seed-t20", DEMO_USERNAME);
      expect(tweet!.stats.likes).toBe(1);
      expect(tweet!.viewer.liked).toBe(true);

      await repo.setReaction("like", "seed-t20", me, false);
      await repo.setReaction("like", "seed-t20", me, false);

      tweet = await repo.getTweet("seed-t20", DEMO_USERNAME);
      expect(tweet!.stats.likes).toBe(0);
      expect(tweet!.viewer.liked).toBe(false);
    });

    it("tracks retweets and bookmarks separately", async () => {
      await repo.setReaction("retweet", "seed-t20", me, true);
      await repo.setReaction("bookmark", "seed-t20", me, true);

      const tweet = await repo.getTweet("seed-t20", DEMO_USERNAME);
      expect(tweet!.stats).toEqual({
        replies: 0,
        retweets: 1,
        likes: 0,
        tips: 0,
      });
      expect(tweet!.viewer).toEqual({
        liked: false,
        retweeted: true,
        bookmarked: true,
        tipped: false,
      });
      expect(
        (await repo.listTweets({ bookmarkedBy: DEMO_USERNAME })).items[0].id
      ).toBe("seed-t04");
    });

    it("rejects reactions to missing tweets", async () => {
      await expect(
        repo.setReaction("like", "nope", me, true)
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("getUser", () => {
    it("returns profiles case-insensitively with a tweet count", async () => {
      const user = await repo.getUser("SarahCodes");
      expect(user).toEqual({
        username: "sarahcodes",
        fullname: "Sarah Chen",
        image: "/avatars/sarahcodes.svg",
        banner: "/media/banner-sarahcodes.svg",
        bio: "Frontend engineer. React, accessibility & good coffee.",
        location: "San Francisco, CA",
        website: null,
        verified: true,
        joinedAt: "2015-03-14T09:00:00.000Z",
        accountType: "personal",
        tweetCount: 3,
      });
    });

    it("derives a profile for authors without a user record", async () => {
      await repo.createTweet({ text: "first!", author: stranger });

      expect(await repo.getUser("NEWCOMER")).toEqual({
        ...stranger,
        bio: null,
        location: null,
        website: null,
        banner: null,
        verified: false,
        joinedAt: NOW.toISOString(),
        accountType: "personal",
        tweetCount: 1,
      });
    });

    it("does not derive profiles from moderated tweets", async () => {
      const tweet = await repo.createTweet({
        text: "something offensive",
        author: { username: "troll", fullname: "OFFENSIVE NAME", image: null },
      });
      block(tweet.id);

      expect(await repo.getUser("troll")).toBeNull();
    });

    it("returns null for unknown users", async () => {
      expect(await repo.getUser("ghost")).toBeNull();
    });
  });

  describe("listTrends", () => {
    it("ranks hashtags by usage, breaking ties by recency", async () => {
      const trends = await repo.listTrends(4);
      expect(trends).toEqual([
        { tag: "#SuperApp", tweetCount: 4 },
        { tag: "#Photography", tweetCount: 3 },
        { tag: "#Backend", tweetCount: 3 },
        { tag: "#React", tweetCount: 2 },
      ]);
    });
  });

  describe("listNotifications", () => {
    it("lists other people's likes, retweets and replies on my tweets, newest first", async () => {
      const notifications = await repo.listNotifications(DEMO_USERNAME);

      expect(notifications.length).toBeGreaterThan(0);
      expect(
        notifications.every((n) => n.actor.username !== DEMO_USERNAME)
      ).toBe(true);
      expect(
        notifications.every((n) =>
          ["seed-t05", "seed-t12", "seed-t19"].includes(tweetIdOf(n)!)
        )
      ).toBe(true);
      expect(notifications.map((n) => n.type)).toEqual(
        expect.arrayContaining(["like", "retweet", "reply"])
      );

      const times = notifications.map((n) => Date.parse(n.createdAt));
      expect([...times].sort((a, b) => b - a)).toEqual(times);

      const reply = notifications.find((n) => n.id === "seed-r03");
      expect(reply).toMatchObject({
        type: "reply",
        actor: { username: "devmarco" },
        tweet: { id: "seed-t05" },
        reply: { id: "seed-r03" },
      });
      // My own reply (seed-r04) and bookmarks are never notifications.
      expect(notifications.some((n) => n.id === "seed-r04")).toBe(false);
    });

    it("respects the limit and is the same for both sources", async () => {
      const notifications = await repo.listNotifications(DEMO_USERNAME, 3);
      expect(notifications).toHaveLength(3);
    });
  });
});

describe("memory and sanity repositories agree", () => {
  it("on every read of the seed data", async () => {
    await expectStoresAgree(
      (repo: Repository) =>
        Promise.all([
          repo.listTweets({ viewer: DEMO_USERNAME, limit: 50 }),
          repo.listTweets({ search: "SuperApp" }),
          repo.listReplies("seed-t01"),
          repo.getUser(DEMO_USERNAME),
          repo.listTrends(),
          repo.listNotifications(DEMO_USERNAME),
        ]),
      {
        world: "core",
        prepare: ({ repo }) => repo.setReaction("like", "seed-t08", me, true),
      }
    );
  });
});
