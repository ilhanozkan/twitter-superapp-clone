import { existsSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { FakeSanityClient } from "../../test/fakeSanityClient";
import {
  isReservedUsername,
  TWEET_MAX_LENGTH,
  textLength,
  USERNAME_PATTERN,
} from "../constants";
import { etaMinutes } from "../superapp/business";
import { isCents } from "../superapp/money";
import { isPlaceId } from "../superapp/places";
import { PRIVATE_TYPES } from "./sanity/ids";
import { seedToSanityDocuments } from "./sanity/seed";
import { createSeedData, DEMO_USERNAME, SeedData } from "./seed";
import { SeedTransfer } from "./seeds/types";
import { composeWalletSeed } from "./seeds/wallet";

const NOW = new Date("2026-10-08T12:00:00.000Z");

describe("seed data", () => {
  const seed = createSeedData(NOW);
  const usernames = new Set(seed.users.map((user) => user.username));
  const tweetIds = new Set(seed.tweets.map((tweet) => tweet.id));

  it("has unique, valid usernames including the demo account", () => {
    expect(usernames.size).toBe(seed.users.length);
    expect(usernames.has(DEMO_USERNAME)).toBe(true);
    for (const username of usernames)
      expect(username).toMatch(USERNAME_PATTERN);
  });

  it("only references users and tweets that exist", () => {
    for (const tweet of seed.tweets)
      expect(usernames.has(tweet.author)).toBe(true);
    for (const reply of seed.replies) {
      expect(usernames.has(reply.author)).toBe(true);
      expect(tweetIds.has(reply.tweetId)).toBe(true);
    }
    for (const reaction of seed.reactions) {
      expect(usernames.has(reaction.username)).toBe(true);
      expect(tweetIds.has(reaction.tweetId)).toBe(true);
    }
  });

  it("respects the tweet length limit", () => {
    for (const text of [...seed.tweets, ...seed.replies].map(
      (item) => item.text
    )) {
      expect(textLength(text)).toBeLessThanOrEqual(TWEET_MAX_LENGTH);
    }
  });

  it("is dated in the past relative to now, with reactions after their tweet", () => {
    const tweetTime = new Map(
      seed.tweets.map((t) => [t.id, Date.parse(t.createdAt)])
    );
    for (const item of [...seed.tweets, ...seed.replies, ...seed.reactions]) {
      expect(Date.parse(item.createdAt)).toBeLessThan(NOW.getTime());
    }
    for (const item of [...seed.replies, ...seed.reactions]) {
      expect(Date.parse(item.createdAt)).toBeGreaterThanOrEqual(
        tweetTime.get(item.tweetId)!
      );
    }
  });

  it("converts to Sanity documents with unique ids", () => {
    const documents = seedToSanityDocuments(seed);
    expect(new Set(documents.map((d) => d._id)).size).toBe(documents.length);
    for (const document of documents) {
      expect(document._id).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
      expect(Object.values(document)).not.toContain(null);
    }
  });
});

describe("seed worlds", () => {
  const core = createSeedData(NOW, { world: "core" });
  const superapp = createSeedData(NOW);

  it("keeps the core world exactly as the app had it", () => {
    expect(core.superapp).toBeNull();
    expect(core.users).toHaveLength(8);
    expect(core.users.every((user) => user.accountType === "personal")).toBe(
      true
    );
    expect(core.tweets.map((tweet) => tweet.id)).toEqual([
      ...Array.from(
        { length: 20 },
        (_, i) => `seed-t${String(i + 1).padStart(2, "0")}`
      ),
      "seed-t99",
    ]);
    expect(core.replies).toHaveLength(10);
    expect(core.tweets.every((tweet) => !tweet.attachment)).toBe(true);
  });

  it("builds the superapp world on top of the core world", () => {
    const { superapp: _ignored, ...coreParts } = core;
    void _ignored;
    expect(superapp.tweets).toEqual(expect.arrayContaining(coreParts.tweets));
    expect(superapp.replies).toEqual(expect.arrayContaining(coreParts.replies));
    expect(superapp.reactions).toEqual(
      expect.arrayContaining(coreParts.reactions)
    );
    for (const user of core.users) {
      const same = superapp.users.find((u) => u.username === user.username);
      expect(same).toEqual({
        ...user,
        accountType: user.username === "superapp" ? "business" : "personal",
      });
    }
    expect(superapp.superapp).not.toBeNull();
  });

  it("adds F's accounts, business profiles and announcement", () => {
    const usernames = superapp.users.map((user) => user.username);
    expect(usernames).toEqual(
      expect.arrayContaining([
        "kizilaykahve",
        "lahmacunlab",
        "bowlandco",
        "ahmet_drives",
        "elif_rides",
        "canwheels",
        "zeynep_xl",
        "demo_customer",
      ])
    );
    expect(
      superapp.users.find((user) => user.username === "demo_customer")!.bio
    ).toBe("A simulated customer for business demos · Demo bot");

    expect(
      superapp.tweets.find((tweet) => tweet.id === "seed-t21")
    ).toMatchObject({
      author: "superapp",
      createdAt: "2026-10-08T11:30:00.000Z",
    });
    expect(
      superapp.replies.find((reply) => reply.id === "seed-r12")
    ).toMatchObject({ tweetId: "seed-t21", author: "sarahcodes" });
  });

  it("makes exactly the profiled accounts businesses", () => {
    const profiles = superapp.superapp!.business.profiles;
    const usernames = superapp.users.map((user) => user.username);
    expect(profiles.map((profile) => profile.username).sort()).toEqual([
      "bowlandco",
      "kizilaykahve",
      "lahmacunlab",
      "superapp",
    ]);
    const businesses = superapp.users
      .filter((user) => user.accountType === "business")
      .map((user) => user.username)
      .sort();
    expect(businesses).toEqual(profiles.map((p) => p.username).sort());

    for (const profile of profiles) {
      expect(isPlaceId(profile.placeId), profile.username).toBe(true);
      expect(profile.hours.opens).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
      expect(profile.hours.closes).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
      expect(profile.hours.timeZone).toBe("Europe/Istanbul");
      expect(isCents(profile.deliveryFee)).toBe(true);
      expect(isCents(profile.minimumOrder)).toBe(true);
      for (const manager of profile.managers)
        expect(usernames.includes(manager), manager).toBe(true);
    }

    const kahve = profiles.find((p) => p.username === "kizilaykahve")!;
    expect(etaMinutes(kahve.prepMinutes, kahve.deliveryMinutes)).toEqual([
      9, 12,
    ]);
    expect(kahve.greeting).toContain("automatic greeting");
    expect(profiles.find((p) => p.username === "superapp")!.managers).toEqual([
      DEMO_USERNAME,
    ]);
  });

  it.each([
    ["core", core],
    ["superapp", superapp],
  ])("uses no reserved usernames and unique ids (%s)", (_world, seed) => {
    for (const user of seed.users) {
      expect(isReservedUsername(user.username), user.username).toBe(false);
    }
    const ids = [...seed.tweets, ...seed.replies].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every account an avatar and every business a banner on disk", () => {
    const publicFile = (url: string) =>
      existsSync(path.join(__dirname, "../../public", url));
    for (const user of superapp.users) {
      expect(publicFile(user.image!), user.username).toBe(true);
      if (user.banner) expect(publicFile(user.banner), user.banner).toBe(true);
    }
    for (const profile of superapp.superapp!.business.profiles) {
      expect(publicFile(profile.banner!), profile.username).toBe(true);
    }
  });

  it("only lets lanes reply to and react on their own new Tweets", () => {
    const coreTweets = new Set(core.tweets.map((tweet) => tweet.id));
    const coreReplies = new Set(core.replies.map((reply) => reply.id));
    const coreReactions = new Set(
      core.reactions.map((r) => `${r.kind}:${r.tweetId}:${r.username}`)
    );

    for (const reply of superapp.replies) {
      if (!coreReplies.has(reply.id))
        expect(coreTweets.has(reply.tweetId), reply.id).toBe(false);
    }
    for (const r of superapp.reactions) {
      if (!coreReactions.has(`${r.kind}:${r.tweetId}:${r.username}`))
        expect(coreTweets.has(r.tweetId), r.tweetId).toBe(false);
    }
  });

  it("folds every lane's transfers without overdraft into consistent balances", () => {
    const wallet = superapp.superapp!.wallet;
    const issued = wallet.transfers
      .filter((transfer) => transfer.from === null)
      .reduce((sum, transfer) => sum + transfer.amount, 0);
    const total = Object.values(wallet.balances).reduce((a, b) => a + b, 0);

    expect(total).toBe(issued);
    expect(Object.values(wallet.balances).every((b) => b >= 0)).toBe(true);
  });
});

describe("composeWalletSeed", () => {
  const authorOf = (username: string) => ({
    username,
    fullname: username,
    image: null,
  });
  const transfer = (
    id: string,
    minutes: number,
    from: string | null,
    to: string,
    amount: number,
    extra: Partial<SeedTransfer> = {}
  ): SeedTransfer => ({
    id,
    kind: from ? "payment" : "issue",
    from,
    to,
    amount,
    note: null,
    context: null,
    holdUntil: null,
    reverses: null,
    createdAt: new Date(NOW.getTime() - minutes * 60_000).toISOString(),
    ...extra,
  });

  it("applies transfers in time order, whatever order lanes list them in", () => {
    const wallet = composeWalletSeed(
      [
        transfer("pay", 10, "Alice", "bob", 4000),
        transfer("grant", 60, null, "alice", 10_000),
        transfer("refund", 5, "bob", "alice", 4000, {
          kind: "order_refund",
          reverses: "pay",
        }),
      ],
      authorOf
    );

    expect(wallet.balances).toEqual({ alice: 10_000, bob: 0 });
    expect(wallet.transfers.map((t) => t.id)).toEqual([
      "grant",
      "pay",
      "refund",
    ]);
    expect(wallet.transfers[1]).toMatchObject({
      from: authorOf("Alice"),
      reversedBy: "refund",
    });
    expect(wallet.transfers[2].reverses).toBe("pay");
  });

  it("rejects seeds that overdraw, repeat or reverse twice", () => {
    expect(() =>
      composeWalletSeed([transfer("pay", 10, "alice", "bob", 1)], authorOf)
    ).toThrow(/overdraws @alice/);
    expect(() =>
      composeWalletSeed(
        [
          transfer("grant", 10, null, "alice", 100),
          transfer("grant", 5, null, "alice", 100),
        ],
        authorOf
      )
    ).toThrow(/not unique/);
    expect(() =>
      composeWalletSeed(
        [
          transfer("grant", 10, null, "alice", 100),
          transfer("r1", 5, "alice", "bob", 100, { reverses: "grant" }),
          transfer("r2", 4, "bob", "alice", 100, { reverses: "grant" }),
        ],
        authorOf
      )
    ).toThrow(/can't be reversed/);
    expect(() =>
      composeWalletSeed([transfer("grant", 10, null, "alice", 1.5)], authorOf)
    ).toThrow(/invalid amount/);
  });
});

describe("Sanity export", () => {
  const world = createSeedData(NOW);
  // A world with money in it, so the private wallet documents are exercised.
  const withMoney: SeedData = {
    ...world,
    superapp: {
      ...world.superapp!,
      wallet: composeWalletSeed(
        [
          {
            id: "seed-grant-sarahcodes",
            kind: "issue",
            from: null,
            to: "sarahcodes",
            amount: 10_000,
            note: null,
            context: null,
            holdUntil: null,
            reverses: null,
            createdAt: "2026-10-01T12:00:00.000Z",
          },
          {
            id: "seed-tx-test",
            kind: "tip",
            from: "sarahcodes",
            to: DEMO_USERNAME,
            amount: 200,
            note: "Nice",
            context: { type: "tweet", id: "seed-t05" },
            holdUntil: null,
            reverses: null,
            createdAt: "2026-10-08T09:30:00.000Z",
          },
        ],
        (username) => {
          const user = world.users.find((u) => u.username === username)!;
          return {
            username: user.username,
            fullname: user.fullname,
            image: user.image,
          };
        }
      ),
    },
  };
  const documents = seedToSanityDocuments(withMoney);

  it("stores private types under private ids, and nothing else", () => {
    const privateTypes = new Set<string>(PRIVATE_TYPES);
    for (const document of documents) {
      expect(document._id.startsWith("private."), document._id).toBe(
        privateTypes.has(document._type)
      );
    }
    expect(new Set(documents.map((d) => d._id)).size).toBe(documents.length);
  });

  it("exports wallets, transfers and business profiles", () => {
    expect(documents).toContainEqual({
      _id: "private.wallet-sarahcodes",
      _type: "wallet",
      _createdAt: "2026-10-01T12:00:00.000Z",
      username: "sarahcodes",
      key: "sarahcodes",
      balance: 9800,
      updatedAt: "2026-10-08T09:30:00.000Z",
    });
    expect(documents).toContainEqual({
      _id: "private.seed-tx-test",
      _type: "transfer",
      _createdAt: "2026-10-08T09:30:00.000Z",
      kind: "tip",
      amount: 200,
      from: {
        username: "sarahcodes",
        fullname: "Sarah Chen",
        image: "/avatars/sarahcodes.svg",
      },
      fromKey: "sarahcodes",
      to: {
        username: DEMO_USERNAME,
        fullname: "Ilhan Ozkan",
        image: "/avatars/illlhanozkan.svg",
      },
      toKey: DEMO_USERNAME,
      note: "Nice",
      context: { type: "tweet", id: "seed-t05" },
      createdAt: "2026-10-08T09:30:00.000Z",
    });
    expect(documents).toContainEqual(
      expect.objectContaining({
        _id: "businessProfile-kizilaykahve",
        _type: "businessProfile",
        username: "kizilaykahve",
        opens: "00:00",
        closes: "00:00",
        timeZone: "Europe/Istanbul",
        deliveryFee: 150,
        managers: [],
      })
    );
    expect(documents).toContainEqual(
      expect.objectContaining({ _id: "user-superapp", accountType: "business" })
    );
  });

  it("exposes no private document to anonymous reads", async () => {
    const client = new FakeSanityClient(documents, () => NOW);
    client.anonymous = true;

    expect(
      await client.fetch(`*[_type in $types]._id`, {
        types: [...PRIVATE_TYPES],
      })
    ).toEqual([]);
    expect(await client.fetch(`*[_id in path("private.**")]._id`)).toEqual([]);

    client.anonymous = false;
    expect(
      await client.fetch(`count(*[_id in path("private.**")])`)
    ).toBeGreaterThan(0);
  });
});
