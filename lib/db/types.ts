import { DataSource } from "../config";
import { INotification } from "../../types/Notification";
import { IPage } from "../../types/Page";
import { ITrend } from "../../types/Trend";
import { IReply, ITweet, ReactionKind } from "../../types/Tweet";
import { IAuthor, IUserProfile } from "../../types/User";

export interface ListTweetsQuery {
  /** Username whose likes/retweets/bookmarks fill `tweet.viewer`. */
  viewer?: string | null;
  /** Only tweets written by this username. */
  author?: string;
  /** Case-insensitive search over the text, username and full name. */
  search?: string;
  /** Only tweets bookmarked by this username. */
  bookmarkedBy?: string;
  /** Only tweets liked by this username. */
  likedBy?: string;
  limit?: number;
  /** Opaque cursor from a previous page's `nextCursor`. */
  cursor?: string | null;
}

export interface NewTweet {
  text: string;
  image?: string | null;
  author: IAuthor;
}

export interface NewReply {
  tweetId: string;
  text: string;
  author: IAuthor;
}

/**
 * Storage-agnostic access to the app's data. Implementations must:
 * - order tweets newest first and hide moderated (blocked) tweets,
 * - compare usernames case-insensitively,
 * - make `setReaction` idempotent (liking twice keeps one like).
 * Validation and authorization are the caller's job.
 */
export interface Repository {
  readonly source: DataSource;

  listTweets(query?: ListTweetsQuery): Promise<IPage<ITweet>>;
  getTweet(id: string, viewer?: string | null): Promise<ITweet | null>;
  createTweet(input: NewTweet): Promise<ITweet>;
  /** Deletes the tweet with its replies and reactions. Returns false if it did not exist. */
  deleteTweet(id: string): Promise<boolean>;

  /** Replies to a tweet, oldest first. */
  listReplies(tweetId: string): Promise<IReply[]>;
  createReply(input: NewReply): Promise<IReply>;

  setReaction(
    kind: ReactionKind,
    tweetId: string,
    actor: IAuthor,
    active: boolean
  ): Promise<void>;

  getUser(username: string): Promise<IUserProfile | null>;
  listTrends(limit?: number): Promise<ITrend[]>;
  /** Likes, retweets and replies other people made on `username`'s tweets, newest first. */
  listNotifications(username: string, limit?: number): Promise<INotification[]>;
}
