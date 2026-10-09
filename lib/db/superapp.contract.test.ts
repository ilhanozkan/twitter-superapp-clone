import { beforeEach, describe, expect, it } from "vitest";

import {
  expectLedgerInvariants,
  expectStoresAgree,
  Subject,
  subjects,
} from "../../test/repositorySubjects";
import { FEATURE_IDS } from "../superapp/features";
import { DEMO_USERNAME } from "./seed";
import { Repository } from "./types";

// How both stores compose the SuperApp sub-repositories: the wallet is on,
// each other feature is on exactly when its lane has shipped, features
// still on their stub read as empty, Tweets carry the new fields, and the
// core keeps working on the full world. Lanes ship in parallel, so nothing
// here may assume another lane's state; lib/db/stubs.test.ts covers the
// stubs themselves.

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

  it("reports the wallet on and every other feature by whether it shipped", () => {
    expect(repo.featureStatus("wallet")).toBe("on");
    for (const id of FEATURE_IDS) {
      // Both test stores can serve every feature.
      expect(repo[id].configured, id).toBe(true);
      expect(repo.featureStatus(id), id).toBe(
        repo[id].implemented ? "on" : "off"
      );
      expect(repo.features[id], id).toBe(repo[id].implemented);
    }
    expect(Object.keys(repo.features).sort()).toEqual([...FEATURE_IDS].sort());
  });

  it("reads features that haven't shipped as empty", async () => {
    for (const id of FEATURE_IDS.filter((id) => !repo[id].implemented)) {
      const feature = repo[id];
      expect(await feature.notifications(DEMO_USERNAME, 10), id).toEqual([]);
      expect(await feature.liveActivity(DEMO_USERNAME), id).toEqual([]);
    }
  });

  it("passes the ledger invariants", async () => {
    await expectLedgerInvariants(subject);
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
    expect(notifications.map((n) => n.type)).toEqual(
      expect.arrayContaining(["like", "retweet", "reply"])
    );
  });
});

describe.each(subjects({ disabled: ["shop"] }))(
  "%s repository without the shop",
  (_name, create) => {
    it("decorates Tweets with no attachment", async () => {
      const { repo } = create();
      expect(repo.featureStatus("shop")).toBe("off");
      const { items } = await repo.listTweets({
        viewer: DEMO_USERNAME,
        limit: 50,
      });
      expect(items.length).toBeGreaterThan(0);
      for (const tweet of items) expect(tweet.attachment).toBeNull();

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
  }
);

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
