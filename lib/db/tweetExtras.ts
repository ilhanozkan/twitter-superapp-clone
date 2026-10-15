import {
  ITweet,
  ITweetStats,
  ITweetViewerState,
  TweetAttachmentInput,
} from "../../types/Tweet";
import { Repository } from "./types";

/** A Tweet as a store reads it, before the SuperApp decoration. */
export interface BareTweet extends Omit<
  ITweet,
  "stats" | "viewer" | "attachment"
> {
  stats: Omit<ITweetStats, "tips">;
  viewer: Omit<ITweetViewerState, "tipped">;
  attachment: TweetAttachmentInput | null;
}

/**
 * Adds what other features know about Tweets in one batched step per read:
 * tip counts and `viewer.tipped` from the wallet, product cards from the
 * shop. A feature that is not "on" contributes nothing (no tips, no
 * attachment), so its data never leaks while it is off or unconfigured.
 */
export async function decorateTweets(
  tweets: BareTweet[],
  viewer: string | null | undefined,
  repo: Pick<Repository, "features" | "wallet" | "shop">
): Promise<ITweet[]> {
  if (tweets.length === 0) return [];

  const productIds = [
    ...new Set(
      tweets.flatMap((tweet) =>
        tweet.attachment ? [tweet.attachment.productId] : []
      )
    ),
  ];
  const [tips, cards] = await Promise.all([
    repo.features.wallet
      ? repo.wallet.tipStats(
          tweets.map((tweet) => tweet.id),
          viewer ?? null
        )
      : new Map<string, { tips: number; tipped: boolean }>(),
    repo.features.shop && productIds.length > 0
      ? repo.shop.getProductCards(productIds)
      : null,
  ]);

  return tweets.map((tweet) => {
    const tip = tips.get(tweet.id);
    return {
      ...tweet,
      stats: { ...tweet.stats, tips: tip?.tips ?? 0 },
      viewer: { ...tweet.viewer, tipped: tip?.tipped ?? false },
      attachment:
        cards && tweet.attachment
          ? {
              type: "product",
              product: cards.get(tweet.attachment.productId) ?? null,
            }
          : null,
    };
  });
}
