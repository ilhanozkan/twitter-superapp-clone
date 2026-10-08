import { IAuthor } from "./User";

export interface ITweetStats {
  replies: number;
  retweets: number;
  likes: number;
}

/** How the user viewing the tweet has interacted with it. */
export interface ITweetViewerState {
  liked: boolean;
  retweeted: boolean;
  bookmarked: boolean;
}

export interface ITweet {
  id: string;
  text: string;
  image: string | null;
  createdAt: string;
  author: IAuthor;
  stats: ITweetStats;
  viewer: ITweetViewerState;
}

export interface IReply {
  id: string;
  tweetId: string;
  text: string;
  createdAt: string;
  author: IAuthor;
}

export type ReactionKind = "like" | "retweet" | "bookmark";

export interface ITweetsData {
  tweets: ITweet[];
}

export interface ITweetData {
  tweet: ITweet;
}
