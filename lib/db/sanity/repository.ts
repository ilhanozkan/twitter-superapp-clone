import {
  DEFAULT_NOTIFICATIONS_LIMIT,
  DEFAULT_TRENDS_LIMIT,
} from "../../constants";
import { computeTrends } from "../../hashtags";
import { INotification } from "../../../types/Notification";
import { IReply, ITweet, ReactionKind } from "../../../types/Tweet";
import { IAuthor, IUser, IUserProfile } from "../../../types/User";
import {
  clampLimit,
  compareNewestFirst,
  decodeCursor,
  encodeCursor,
} from "../cursor";
import { ConfigurationError, NotFoundError } from "../errors";
import { ListTweetsQuery, NewReply, NewTweet, Repository } from "../types";
import {
  notificationsQuery,
  REPLIES_QUERY,
  TWEET_AND_REFERENCES_QUERY,
  TWEET_BY_ID_QUERY,
  trendTextsQuery,
  tweetListQuery,
  USER_QUERY,
  VISIBLE_TWEET_ID_QUERY,
} from "./queries";

type Params = Record<string, unknown>;

interface SanityDocument {
  _id: string;
  _createdAt: string;
  [field: string]: unknown;
}

type Mutation = { delete: { id: string } };

/** The subset of `@sanity/client` the repository uses (keeps it easy to fake in tests). */
export interface SanityClientLike {
  fetch<T = unknown>(query: string, params?: Params): Promise<T>;
  create(document: {
    _type: string;
    [field: string]: unknown;
  }): Promise<SanityDocument>;
  createIfNotExists(document: {
    _id: string;
    _type: string;
    [field: string]: unknown;
  }): Promise<SanityDocument>;
  delete(id: string): Promise<unknown>;
  mutate(mutations: Mutation[]): Promise<unknown>;
}

export interface SanityRepositoryOptions {
  /** Writes need a token with editor rights; without one the repository is read-only. */
  canWrite: boolean;
}

const TREND_WINDOW = 500;

/** Sanity ids allow [a-zA-Z0-9._-]; usernames never contain "-", so this is unambiguous. */
export const reactionDocumentId = (
  kind: ReactionKind,
  tweetId: string,
  username: string
) => `${kind}-${tweetId}-${username.toLowerCase()}`;

const searchTerms = (search: string) =>
  search
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `${term}*`);

export function createSanityRepository(
  client: SanityClientLike,
  { canWrite }: SanityRepositoryOptions
): Repository {
  const assertWritable = () => {
    if (!canWrite) {
      throw new ConfigurationError(
        "SANITY_API_TOKEN is not set, so the Sanity data source is read-only."
      );
    }
  };

  const assertTweetVisible = async (id: string) => {
    const found = await client.fetch<string | null>(VISIBLE_TWEET_ID_QUERY, {
      id,
    });
    if (!found) throw new NotFoundError("Tweet not found");
  };

  const viewerParam = (viewer?: string | null) => viewer?.toLowerCase() ?? "";

  return {
    source: "sanity",

    async listTweets(query: ListTweetsQuery = {}) {
      const limit = clampLimit(query.limit);
      const cursor = decodeCursor(query.cursor);
      const terms = query.search ? searchTerms(query.search) : [];

      const params: Params = { viewer: viewerParam(query.viewer) };
      if (query.author) params.author = query.author.toLowerCase();
      if (terms.length) params.search = terms;
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
          search: terms.length > 0,
          bookmarkedBy: !!query.bookmarkedBy,
          likedBy: !!query.likedBy,
          cursor: !!cursor,
        },
        limit + 1
      );

      const tweets = (await client.fetch<ITweet[]>(groq, params)) ?? [];
      const page = tweets.slice(0, limit);
      const last = page[page.length - 1];

      return {
        items: page,
        nextCursor: tweets.length > limit && last ? encodeCursor(last) : null,
      };
    },

    async getTweet(id, viewer) {
      return (
        (await client.fetch<ITweet | null>(TWEET_BY_ID_QUERY, {
          id,
          viewer: viewerParam(viewer),
        })) ?? null
      );
    },

    async createTweet({ text, image, author }: NewTweet) {
      assertWritable();

      const document = await client.create({
        _type: "tweet",
        tweet: text,
        username: author.username,
        fullname: author.fullname,
        ...(author.image ? { userImage: author.image } : {}),
        ...(image ? { tweetImage: image } : {}),
        blockTweet: false,
      });

      return {
        id: document._id,
        text,
        image: image ?? null,
        createdAt: document._createdAt,
        author: { ...author },
        stats: { replies: 0, retweets: 0, likes: 0 },
        viewer: { liked: false, retweeted: false, bookmarked: false },
      };
    },

    async deleteTweet(id) {
      assertWritable();

      const ids =
        (await client.fetch<string[]>(TWEET_AND_REFERENCES_QUERY, { id })) ??
        [];
      if (!ids.includes(id)) return false;

      // One transaction: referencing documents first, so strong references
      // (replies) never block deleting the tweet.
      await client.mutate([
        ...ids
          .filter((other) => other !== id)
          .map((other) => ({ delete: { id: other } })),
        { delete: { id } },
      ]);
      return true;
    },

    async listReplies(tweetId) {
      return (await client.fetch<IReply[]>(REPLIES_QUERY, { tweetId })) ?? [];
    },

    async createReply({ tweetId, text, author }: NewReply) {
      assertWritable();
      await assertTweetVisible(tweetId);

      const document = await client.create({
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
      assertWritable();
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
      const safeLimit = Math.max(0, Math.floor(limit));
      const result = await client.fetch<{
        reactions: INotification[];
        replies: INotification[];
      }>(notificationsQuery(safeLimit), { username: username.toLowerCase() });

      return [...(result?.reactions ?? []), ...(result?.replies ?? [])]
        .filter((notification) => notification.tweet)
        .sort(compareNewestFirst)
        .slice(0, safeLimit);
    },
  };
}
