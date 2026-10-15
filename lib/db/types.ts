import { DataSource } from "../config";
import { INotification } from "../../types/Notification";
import { IPage } from "../../types/Page";
import {
  FeatureId,
  FeatureStatus,
  IFeatures,
  ILiveActivity,
} from "../../types/Superapp";
import { ITrend } from "../../types/Trend";
import {
  IReply,
  ITweet,
  ReactionKind,
  TweetAttachmentInput,
} from "../../types/Tweet";
import { IAuthor, IUser, IUserProfile } from "../../types/User";
import { IWallet } from "../../types/Wallet";
import type { BusinessRepository } from "./business/types";
import type { ChannelsRepository, MessagesRepository } from "./messages/types";
import type { OrdersRepository } from "./orders/types";
import type { RidesRepository } from "./rides/types";
import type { ShopRepository } from "./shop/types";
import type { StoriesRepository } from "./stories/types";
import type { WalletRepository } from "./wallet/types";

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

export interface PageQuery {
  limit?: number;
  cursor?: string | null;
}

/** The deterministic id of an operation's primary record and the fingerprint of its request. */
export interface IdempotentInput {
  operationId: string;
  fingerprint: string;
}

/** Every money-moving result reports the acting user's wallet afterwards. */
export interface MoneyResult {
  wallet: IWallet;
  replayed: boolean;
}

/** What every SuperApp feature's sub-repository has in common. */
export interface FeatureRepository {
  /** The lane is built (stubs: false). */
  readonly implemented: boolean;
  /** The data source can serve it (Sanity private features need a token). */
  readonly configured: boolean;
  /** This feature's notifications for `username`, newest first, at most `limit`. */
  notifications(username: string, limit: number): Promise<INotification[]>;
  /** Things in progress for `username`. */
  liveActivity(username: string): Promise<ILiveActivity[]>;
}

export interface NewTweet {
  text: string;
  image?: string | null;
  author: IAuthor;
  attachment?: TweetAttachmentInput | null;
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
 *
 * SuperApp features live in sub-repositories (`wallet`, `shop`, ...), one
 * per lane, each declared in `lib/db/<feature>/types.ts`.
 */
export interface Repository {
  readonly source: DataSource;

  /** Tweets carry `stats.tips`, `viewer.tipped` and `attachment` (see tweetExtras). */
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
  /** Core notifications merged with every "on" feature's, newest first. */
  listNotifications(username: string, limit?: number): Promise<INotification[]>;
  /** Users whose username or full name matches every word (lib/db/search.ts rules), by username. */
  searchUsers(query: string, limit?: number): Promise<IUser[]>;

  /** "off": not implemented or in DISABLED_FEATURES; "unconfigured": implemented but not configured. */
  featureStatus(id: FeatureId): FeatureStatus;
  /** status === "on" */
  readonly features: IFeatures;
  readonly wallet: WalletRepository;
  readonly business: BusinessRepository;
  readonly shop: ShopRepository;
  readonly orders: OrdersRepository;
  readonly rides: RidesRepository;
  readonly stories: StoriesRepository;
  readonly messages: MessagesRepository;
  readonly channels: ChannelsRepository;
}
