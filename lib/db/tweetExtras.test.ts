import { describe, expect, it, vi } from "vitest";

import { IFeatures } from "../../types/Superapp";
import { IProductCard } from "../../types/Shop";
import { unbuiltShop, unbuiltWallet } from "./stubs";
import { BareTweet, decorateTweets } from "./tweetExtras";

const author = {
  username: "kizilaykahve",
  fullname: "Kızılay Kahve",
  image: null,
};

const bare = (id: string, productId?: string): BareTweet => ({
  id,
  text: id,
  image: null,
  createdAt: "2026-10-08T12:00:00.000Z",
  author,
  stats: { replies: 0, retweets: 0, likes: 1 },
  viewer: { liked: false, retweeted: false, bookmarked: false },
  attachment: productId ? { type: "product", productId } : null,
});

const card = (id: string): IProductCard => ({
  id,
  name: id,
  price: 500,
  image: null,
  imageAlt: null,
  available: true,
  business: {
    ...author,
    status: {
      open: true,
      orderable: true,
      reason: null,
      label: "Open 24 hours",
      opensAt: null,
      closesAt: null,
    },
    etaMinutes: [9, 12],
  },
});

const features = (on: Partial<IFeatures>): IFeatures => ({
  wallet: false,
  messages: false,
  channels: false,
  shop: false,
  orders: false,
  rides: false,
  stories: false,
  ...on,
});

function sources(on: Partial<IFeatures>) {
  return {
    features: features(on),
    wallet: {
      ...unbuiltWallet(true),
      tipStats: vi.fn(async () => new Map([["t1", { tips: 3, tipped: true }]])),
    },
    shop: {
      ...unbuiltShop(true),
      getProductCards: vi.fn(async () => new Map([["p1", card("p1")]])),
    },
  };
}

describe("decorateTweets", () => {
  it("adds tips and product cards in one batched read each", async () => {
    const repo = sources({ wallet: true, shop: true });
    const [t1, t2, t3] = await decorateTweets(
      [bare("t1", "p1"), bare("t2", "gone"), bare("t3", "p1")],
      "sarahcodes",
      repo
    );

    expect(repo.wallet.tipStats).toHaveBeenCalledTimes(1);
    expect(repo.wallet.tipStats).toHaveBeenCalledWith(
      ["t1", "t2", "t3"],
      "sarahcodes"
    );
    expect(repo.shop.getProductCards).toHaveBeenCalledTimes(1);
    expect(repo.shop.getProductCards).toHaveBeenCalledWith(["p1", "gone"]);

    expect(t1.stats).toEqual({ replies: 0, retweets: 0, likes: 1, tips: 3 });
    expect(t1.viewer.tipped).toBe(true);
    expect(t1.attachment).toEqual({ type: "product", product: card("p1") });
    expect(t2.stats.tips).toBe(0);
    // A deleted product leaves the attachment with no card.
    expect(t2.attachment).toEqual({ type: "product", product: null });
    expect(t3.attachment?.product?.id).toBe("p1");
  });

  it("reads nothing from features that are off", async () => {
    const repo = sources({});
    const [tweet] = await decorateTweets([bare("t1", "p1")], null, repo);

    expect(repo.wallet.tipStats).not.toHaveBeenCalled();
    expect(repo.shop.getProductCards).not.toHaveBeenCalled();
    expect(tweet.stats.tips).toBe(0);
    expect(tweet.viewer.tipped).toBe(false);
    expect(tweet.attachment).toBeNull();
  });

  it("skips the reads for an empty page or Tweets without attachments", async () => {
    const repo = sources({ wallet: true, shop: true });
    expect(await decorateTweets([], null, repo)).toEqual([]);
    expect(repo.wallet.tipStats).not.toHaveBeenCalled();

    const [tweet] = await decorateTweets([bare("t9")], undefined, repo);
    expect(repo.wallet.tipStats).toHaveBeenCalledWith(["t9"], null);
    expect(repo.shop.getProductCards).not.toHaveBeenCalled();
    expect(tweet.attachment).toBeNull();
  });
});
