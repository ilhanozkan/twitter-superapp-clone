import { beforeEach, describe, expect, it } from "vitest";

import {
  expectLedgerInvariants,
  expectStoresAgree,
  Subject,
  subjects,
} from "../../test/repositorySubjects";
import { FEATURE_IDS } from "../superapp/features";
import { NotFoundError, NotImplementedError } from "./errors";
import { DEMO_USERNAME } from "./seed";
import { Repository } from "./types";

// How both stores compose the SuperApp sub-repositories while every lane is
// still a stub: everything reads as empty and is "off", Tweets carry the new
// fields with neutral values, and the core keeps working on the full world.

const me = {
  username: DEMO_USERNAME,
  fullname: "Ilhan Ozkan",
  image: "/avatars/illlhanozkan.svg",
};

describe.each(subjects())("%s repository composition", (_name, create) => {
  let subject: Subject;
  let repo: Repository;

  beforeEach(() => {
    subject = create();
    repo = subject.repo;
  });

  it("reports every unbuilt feature as off", () => {
    for (const id of FEATURE_IDS)
      expect(repo.featureStatus(id), id).toBe("off");
    expect(Object.values(repo.features).every((on) => !on)).toBe(true);
    expect(Object.keys(repo.features).sort()).toEqual([...FEATURE_IDS].sort());
  });

  it("reads stubbed features as empty", async () => {
    expect(await repo.wallet.getWallet("sarahcodes")).toEqual({
      username: "sarahcodes",
      balance: 0,
      pending: 0,
      available: 0,
      frozen: false,
    });
    expect(await repo.wallet.listActivity(DEMO_USERNAME)).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(await repo.wallet.tipStats(["seed-t01"], DEMO_USERNAME)).toEqual(
      new Map()
    );
    expect(await repo.business.getBusiness("kizilaykahve")).toBeNull();
    expect(await repo.business.listManagedBusinesses(DEMO_USERNAME)).toEqual(
      []
    );
    expect(await repo.shop.getProductCards(["seed-p-kk-latte"])).toEqual(
      new Map()
    );
    expect(await repo.shop.getProduct("seed-p-kk-latte")).toBeNull();
    expect(await repo.orders.listOrders({ buyer: DEMO_USERNAME })).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(await repo.rides.getDriver("ahmet_drives")).toBeNull();
    expect(await repo.stories.listTray(DEMO_USERNAME)).toEqual([]);
    expect(await repo.stories.getStory("seed-s1", DEMO_USERNAME)).toBeNull();
    expect(await repo.messages.unreadConversations(DEMO_USERNAME)).toBe(0);
    expect(await repo.channels.listChannels({}, DEMO_USERNAME)).toEqual([]);
    for (const id of FEATURE_IDS) {
      const feature = id === "wallet" ? repo.wallet : repo[id];
      expect(await feature.notifications(DEMO_USERNAME, 10), id).toEqual([]);
      expect(await feature.liveActivity(DEMO_USERNAME), id).toEqual([]);
    }
    await expect(
      repo.messages.listMessages("dm-a-b", DEMO_USERNAME)
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses writes to stubbed features with NotImplementedError", async () => {
    const key = { operationId: "tx-1", fingerprint: "f" };
    const writes = [
      repo.wallet.topUp({ ...key, to: me, amount: 2500 }),
      repo.business.setAcceptingOrders("kizilaykahve", false),
      repo.shop.setProductAvailability("seed-p-kk-latte", false),
      repo.orders.cancelOrder({ id: "seed-o01", as: "buyer" }),
      repo.rides.cancelRide({ id: "seed-ride01" }),
      repo.stories.markSeen(["seed-s1"], me),
      repo.messages.openDirect(me, { ...me, username: "sarahcodes" }),
      repo.channels.setMembership("ankara_eats", me, true),
    ];
    for (const write of writes) {
      await expect(write).rejects.toBeInstanceOf(NotImplementedError);
    }
  });

  it("passes the ledger invariants", async () => {
    await expectLedgerInvariants(subject);
  });

  it("decorates Tweets with neutral tips and no attachment while the features are off", async () => {
    const { items } = await repo.listTweets({
      viewer: DEMO_USERNAME,
      limit: 50,
    });
    expect(items.length).toBeGreaterThan(0);
    for (const tweet of items) {
      expect(tweet.stats.tips).toBe(0);
      expect(tweet.viewer.tipped).toBe(false);
      expect(tweet.attachment).toBeNull();
    }

    const created = await repo.createTweet({
      text: "Try the latte",
      author: me,
      attachment: { type: "product", productId: "seed-p-kk-latte" },
    });
    expect(created).toMatchObject({
      stats: { tips: 0 },
      viewer: { tipped: false },
      attachment: null,
    });
    expect((await repo.getTweet(created.id, DEMO_USERNAME))!.attachment).toBe(
      null
    );
  });

  it("adds the SuperApp accounts to the world", async () => {
    expect(await repo.getUser("KizilayKahve")).toMatchObject({
      username: "kizilaykahve",
      fullname: "Kızılay Kahve",
      accountType: "business",
    });
    expect((await repo.getUser("superapp"))!.accountType).toBe("business");
    expect((await repo.getUser("ahmet_drives"))!.accountType).toBe("personal");
    expect((await repo.getUser(DEMO_USERNAME))!.accountType).toBe("personal");
  });

  describe("searchUsers", () => {
    const usernames = async (query: string, limit?: number) =>
      (await repo.searchUsers(query, limit)).map((user) => user.username);

    it("matches usernames and full names by word prefix, in username order", async () => {
      expect(await usernames("marco")).toEqual(["devmarco"]);
      expect(await usernames("Rossi Marco")).toEqual(["devmarco"]);
      expect(await usernames("@KIZILAY")).toEqual(["kizilaykahve"]);
      expect(await usernames("kızılay kahve")).toEqual(["kizilaykahve"]);
      expect(await usernames("drives")).toEqual([]);
      expect(await usernames("ahmet_drives")).toEqual(["ahmet_drives"]);
      expect(await usernames("demo")).toEqual(["demo_customer"]);
    });

    it("returns whole user records and respects the limit", async () => {
      const [user] = await repo.searchUsers("sarah");
      expect(user).toMatchObject({
        username: "sarahcodes",
        fullname: "Sarah Chen",
        accountType: "personal",
        verified: true,
      });
      expect(user).not.toHaveProperty("tweetCount");

      const all = await usernames("a", 50);
      expect(all).toEqual([...all].sort());
      expect(await usernames("a", 2)).toEqual(all.slice(0, 2));
    });

    it("matches nothing for blank or punctuation-only queries", async () => {
      expect(await usernames("")).toEqual([]);
      expect(await usernames("!!!")).toEqual([]);
      expect(await usernames("sarah", 0)).toEqual([]);
    });
  });

  it("keeps the core notifications on the full world", async () => {
    const notifications = await repo.listNotifications(DEMO_USERNAME);
    expect(notifications.length).toBeGreaterThan(0);
    expect(
      notifications.every((n) => ["like", "retweet", "reply"].includes(n.type))
    ).toBe(true);
  });
});

describe("stores agree on the superapp world", () => {
  it("for Tweets, users, search and notifications", async () => {
    await expectStoresAgree((repo: Repository) =>
      Promise.all([
        repo.listTweets({ viewer: DEMO_USERNAME, limit: 50 }),
        repo.getTweet("seed-t21", "sarahcodes"),
        repo.listReplies("seed-t21"),
        repo.getUser("kizilaykahve"),
        repo.searchUsers("a", 20),
        repo.listTrends(),
        repo.listNotifications("superapp"),
      ])
    );
  });
});

describe("DISABLED_FEATURES", () => {
  it.each(subjects({ disabled: ["wallet", "stories"] }))(
    "keeps disabled features off (%s)",
    (_name, create) => {
      const { repo } = create();
      expect(repo.featureStatus("wallet")).toBe("off");
      expect(repo.features.stories).toBe(false);
    }
  );
});
