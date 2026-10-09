import { randomUUID } from "crypto";

import {
  DEFAULT_NOTIFICATIONS_LIMIT,
  DEFAULT_TRENDS_LIMIT,
  DEFAULT_USER_SEARCH_LIMIT,
} from "../../constants";
import { computeTrends } from "../../hashtags";
import { CoreNotification } from "../../../types/Notification";
import { FeatureId } from "../../../types/Superapp";
import { IReply, ReactionKind } from "../../../types/Tweet";
import { IAuthor, IUser, IUserProfile } from "../../../types/User";
import {
  clampLimit,
  compareNewestFirst,
  decodeCursor,
  encodeCursor,
} from "../cursor";
import { NotFoundError } from "../errors";
import { resolveFeatures, SubRepositories } from "../features";
import { mergeNotifications } from "../notifications";
import { searchTerms } from "../search";
import { decorateTweets } from "../tweetExtras";
import { ListTweetsQuery, NewReply, NewTweet, Repository } from "../types";
import { createSanityBusiness } from "./business";
import { createSanityChannels } from "./channels";
import { assertWritable, createRead, SanityDeps } from "./deps";
import { createSanityLedger, SanityMutation } from "./ledger";
import { createSanityMessages } from "./messages";
import { createSanityOrders } from "./orders";
import {
  notificationsQuery,
  REPLIES_QUERY,
  searchUsersQuery,
  TWEET_AND_REFERENCES_QUERY,
  TWEET_BY_ID_QUERY,
  trendTextsQuery,
  tweetListQuery,
  USER_QUERY,
  VISIBLE_TWEET_ID_QUERY,
} from "./queries";
import { createSanityRides } from "./rides";
import { createSanityShop } from "./shop";
import { createSanityStories } from "./stories";
import { attachmentField, SanityTweetRow, toBareTweet } from "./tweetExtras";
import { createSanityWallet } from "./wallet";

type Params = Record<string, unknown>;

interface SanityDocument {
  _id: string;
  _createdAt: string;
  [field: string]: unknown;
}

/** The subset of `@sanity/client` the repository uses (keeps it easy to fake in tests). */
export interface SanityClientLike {
  fetch<T = unknown>(query: string, params?: Params): Promise<T>;
  create(document: {
    _id?: string;
    _type: string;
    [field: string]: unknown;
  }): Promise<SanityDocument>;
  createIfNotExists(document: {
    _id: string;
    _type: string;
    [field: string]: unknown;
  }): Promise<SanityDocument>;
  delete(id: string): Promise<unknown>;
  /** One atomic transaction. */
  mutate(
    mutations: SanityMutation[],
    options?: { visibility?: "sync" | "async" | "deferred" }
  ): Promise<unknown>;
}

export interface SanityRepositoryOptions {
  /** Writes need a token with editor rights; without one the repository is read-only. */
  canWrite: boolean;
  /** The "raw"-perspective client for SuperApp documents (default: `client`). */
  superappClient?: SanityClientLike;
  /** Private SuperApp documents need a token to read (default: `canWrite`). */
  canReadPrivate?: boolean;
  now?: () => Date;
  generateId?: () => string;
  /** Backoff between ledger retries; tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>;
  /** SUPERAPP_TIME_SCALE, applied when orders and rides are created. */
  timeScale?: number;
  /** DISABLED_FEATURES */
  disabled?: ReadonlySet<FeatureId>;
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const TREND_WINDOW = 500;

/** Sanity ids allow [a-zA-Z0-9._-]; usernames never contain "-", so this is unambiguous. */
export const reactionDocumentId = (
  kind: ReactionKind,
  tweetId: string,
  username: string
) => `${kind}-${tweetId}-${username.toLowerCase()}`;

export function createSanityRepository(
  client: SanityClientLike,
  {
    canWrite,
    superappClient = client,
    canReadPrivate = canWrite,
    now = () => new Date(),
    generateId = randomUUID,
    sleep = wait,
    timeScale = 1,
    disabled = new Set(),
  }: SanityRepositoryOptions
): Repository {
  const writable = () => assertWritable(canWrite);
  const read = createRead(superappClient);

  const deps: SanityDeps = {
    client: superappClient,
    canWrite,
    canReadPrivate,
    now,
    generateId,
    sleep,
    timeScale,
    ledger: createSanityLedger({ client: superappClient, read, now, sleep }),
    assertWritable: writable,
    read,
    // Sub-repositories only call it after construction, once `repository` exists.
    self: () => repository,
  };
  const subs: SubRepositories = {
    wallet: createSanityWallet(deps),
    business: createSanityBusiness(deps),
    shop: createSanityShop(deps),
    orders: createSanityOrders(deps),
    rides: createSanityRides(deps),
    stories: createSanityStories(deps),
    messages: createSanityMessages(deps),
    channels: createSanityChannels(deps),
  };
  const { featureStatus, features } = resolveFeatures(subs, disabled);
  const decorate = (rows: SanityTweetRow[], viewer?: string | null) =>
    decorateTweets(rows.map(toBareTweet), viewer, { features, ...subs });

  const assertTweetVisible = async (id: string) => {
    const found = await client.fetch<string | null>(VISIBLE_TWEET_ID_QUERY, {
      id,
    });
    if (!found) throw new NotFoundError("Tweet not found");
  };

  const viewerParam = (viewer?: string | null) => viewer?.toLowerCase() ?? "";

  const coreNotifications = async (username: string, limit: number) => {
    const result = await client.fetch<{
      reactions: CoreNotification[];
      replies: CoreNotification[];
    }>(notificationsQuery(limit), { username: username.toLowerCase() });

    return [...(result?.reactions ?? []), ...(result?.replies ?? [])]
      .filter((notification) => notification.tweet)
      .sort(compareNewestFirst)
      .slice(0, limit);
  };

  const repository: Repository = {
    source: "sanity",

    async listTweets(query: ListTweetsQuery = {}) {
      const limit = clampLimit(query.limit);
      const cursor = decodeCursor(query.cursor);
      // Blank searches are ignored; punctuation-only ones ("!!!") match nothing.
      const searching = !!query.search?.trim();
      const terms = searchTerms(query.search ?? "");
      if (searching && terms.length === 0)
        return { items: [], nextCursor: null };

      const params: Params = { viewer: viewerParam(query.viewer) };
      if (query.author) params.author = query.author.toLowerCase();
      if (searching) params.search = terms.map((term) => `${term}*`);
      if (query.bookmarkedBy)
        params.bookmarkedBy = query.bookmarkedBy.toLowerCase();
      if (query.likedBy) params.likedBy = query.likedBy.toLowerCase();
      if (cursor) {
        params.cursorCreatedAt = cursor.createdAt;
        params.cursorId = cursor.id;
      }

      const groq = tweetListQuery(
        {
          author: !!query.author,
          search: searching,
          bookmarkedBy: !!query.bookmarkedBy,
          likedBy: !!query.likedBy,
          cursor: !!cursor,
        },
        limit + 1
      );

      const tweets = (await client.fetch<SanityTweetRow[]>(groq, params)) ?? [];
      const page = tweets.slice(0, limit);
      const last = page[page.length - 1];

      return {
        items: await decorate(page, query.viewer),
        nextCursor: tweets.length > limit && last ? encodeCursor(last) : null,
      };
    },

    async getTweet(id, viewer) {
      const row = await client.fetch<SanityTweetRow | null>(TWEET_BY_ID_QUERY, {
        id,
        viewer: viewerParam(viewer),
      });
      if (!row) return null;
      const [tweet] = await decorate([row], viewer);
      return tweet;
    },

    async createTweet({ text, image, author, attachment }: NewTweet) {
      writable();

      const stored = attachmentField(attachment);
      const document = await client.create({
        _id: generateId(),
        _type: "tweet",
        tweet: text,
        username: author.username,
        fullname: author.fullname,
        ...(author.image ? { userImage: author.image } : {}),
        ...(image ? { tweetImage: image } : {}),
        blockTweet: false,
        ...(stored ? { attachment: stored } : {}),
      });

      const [tweet] = await decorate(
        [
          {
            id: document._id,
            text,
            image: image ?? null,
            createdAt: document._createdAt,
            author: { ...author },
            stats: { replies: 0, retweets: 0, likes: 0 },
            viewer: { liked: false, retweeted: false, bookmarked: false },
            attachment: stored ?? null,
          },
        ],
        author.username
      );
      return tweet;
    },

    async deleteTweet(id) {
      writable();

      const found = await client.fetch<{
        tweet: string | null;
        references: string[];
      }>(TWEET_AND_REFERENCES_QUERY, { id });
      if (!found?.tweet) return false;

      // One transaction: referencing documents first, so strong references
      // (replies) never block deleting the tweet.
      await client.mutate([
        ...found.references.map((other) => ({ delete: { id: other } })),
        { delete: { id } },
      ]);
      return true;
    },

    async listReplies(tweetId) {
      return (await client.fetch<IReply[]>(REPLIES_QUERY, { tweetId })) ?? [];
    },

    async createReply({ tweetId, text, author }: NewReply) {
      writable();
      await assertTweetVisible(tweetId);

      const document = await client.create({
        _id: generateId(),
        _type: "comment",
        comment: text,
        username: author.username,
        fullname: author.fullname,
        ...(author.image ? { profileImg: author.image } : {}),
        tweet: { _type: "reference", _ref: tweetId },
      });

      return {
        id: document._id,
        tweetId,
        text,
        createdAt: document._createdAt,
        author: { ...author },
      };
    },

    async setReaction(kind, tweetId, actor: IAuthor, active) {
      writable();
      await assertTweetVisible(tweetId);

      const _id = reactionDocumentId(kind, tweetId, actor.username);
      if (!active) {
        await client.delete(_id);
        return;
      }

      await client.createIfNotExists({
        _id,
        _type: kind,
        // Weak, so reactions never block deleting a tweet from the Studio.
        tweet: { _type: "reference", _ref: tweetId, _weak: true },
        username: actor.username,
        fullname: actor.fullname,
        ...(actor.image ? { userImage: actor.image } : {}),
      });
    },

    async getUser(username) {
      const result = await client.fetch<{
        user: IUser | null;
        latest: IAuthor | null;
        firstTweetAt: string | null;
        tweetCount: number;
      }>(USER_QUERY, { username: username.toLowerCase() });

      if (result?.user) {
        const user = result.user;
        return {
          username: user.username,
          fullname: user.fullname,
          image: user.image ?? null,
          banner: user.banner ?? null,
          bio: user.bio ?? null,
          location: user.location ?? null,
          website: user.website ?? null,
          verified: !!user.verified,
          joinedAt: user.joinedAt,
          accountType:
            user.accountType === "business" ? "business" : "personal",
          tweetCount: result.tweetCount,
        };
      }

      if (!result?.latest || !result.firstTweetAt) return null;

      const profile: IUserProfile = {
        username: result.latest.username,
        fullname: result.latest.fullname,
        image: result.latest.image ?? null,
        banner: null,
        bio: null,
        location: null,
        website: null,
        verified: false,
        joinedAt: result.firstTweetAt,
        accountType: "personal",
        tweetCount: result.tweetCount,
      };
      return profile;
    },

    async listTrends(limit = DEFAULT_TRENDS_LIMIT) {
      const texts =
        (await client.fetch<(string | null)[]>(
          trendTextsQuery(TREND_WINDOW)
        )) ?? [];
      return computeTrends(
        texts.filter((text): text is string => typeof text === "string"),
        limit
      );
    },

    async listNotifications(username, limit = DEFAULT_NOTIFICATIONS_LIMIT) {
      return mergeNotifications(
        (safeLimit) => coreNotifications(username, safeLimit),
        subs,
        features,
        username,
        limit
      );
    },

    async searchUsers(query, limit = DEFAULT_USER_SEARCH_LIMIT) {
      const terms = searchTerms(query);
      const safeLimit = Math.max(0, Math.floor(limit));
      if (terms.length === 0 || safeLimit === 0) return [];

      return (
        (await client.fetch<IUser[]>(searchUsersQuery(safeLimit), {
          search: terms.map((term) => `${term}*`),
        })) ?? []
      );
    },

    featureStatus,
    features,
    ...subs,
  };
  return repository;
}
