import { BareTweet } from "../tweetExtras";

/** A Tweet as TWEET_PROJECTION reads it: the attachment as stored. */
export interface SanityTweetRow extends Omit<BareTweet, "attachment"> {
  attachment: { kind: "product"; productId: string } | null;
}

/** The stored attachment `{ kind, productId }` as the API's input shape. */
export function toBareTweet({
  attachment,
  ...tweet
}: SanityTweetRow): BareTweet {
  return {
    ...tweet,
    attachment:
      attachment?.kind === "product" && attachment.productId
        ? { type: "product", productId: attachment.productId }
        : null,
  };
}

/** The document field for a new Tweet's attachment. */
export function attachmentField(
  attachment: BareTweet["attachment"] | undefined
): SanityTweetRow["attachment"] | undefined {
  return attachment
    ? { kind: attachment.type, productId: attachment.productId }
    : undefined;
}
