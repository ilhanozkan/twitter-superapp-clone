import { IProductCard } from "./Shop";
import { IAuthor } from "./User";

export interface ITweetStats {
  replies: number;
  retweets: number;
  likes: number;
  tips: number;
}

/** How the user viewing the tweet has interacted with it. */
export interface ITweetViewerState {
  liked: boolean;
  retweeted: boolean;
  bookmarked: boolean;
  tipped: boolean;
}

export type TweetAttachmentInput = { type: "product"; productId: string };

/** `product: null` = the product was deleted. The whole attachment is null when features.shop is off. */
export type ITweetAttachment = {
  type: "product";
  product: IProductCard | null;
};

export interface ITweet {
  id: string;
  text: string;
  image: string | null;
  createdAt: string;
  author: IAuthor;
  stats: ITweetStats;
  viewer: ITweetViewerState;
  attachment: ITweetAttachment | null;
}

export interface IReply {
  id: string;
  tweetId: string;
  text: string;
  createdAt: string;
  author: IAuthor;
}

export type ReactionKind = "like" | "retweet" | "bookmark";
