import { randomUUID } from "crypto";

import {
  DEFAULT_NOTIFICATIONS_LIMIT,
  DEFAULT_TRENDS_LIMIT,
} from "../constants";
import { computeTrends } from "../hashtags";
import { INotification } from "../../types/Notification";
import { IReply, ITweet, ReactionKind } from "../../types/Tweet";
import { IAuthor, IUser, IUserProfile } from "../../types/User";
import {
  clampLimit,
  compareNewestFirst,
  decodeCursor,
  encodeCursor,
  isAfterCursor,
} from "./cursor";
import { NotFoundError } from "./errors";
import { matchesSearch, searchTerms } from "./search";
import { createSeedData, SeedData } from "./seed";
import { ListTweetsQuery, NewReply, NewTweet, Repository } from "./types";

interface StoredTweet {
  id: string;
  text: string;
  image: string | null;
  createdAt: string;
  author: IAuthor;
  blocked: boolean;
}

interface StoredReaction {
  kind: ReactionKind;
  tweetId: string;
  actor: IAuthor;
  createdAt: string;
}

export interface MemoryState {
  /** Keyed by lower-cased username. */
  users: Map<string, IUser>;
  tweets: Map<string, StoredTweet>;
  replies: IReply[];
  /** Keyed by `reactionKey()`, which makes reactions idempotent. */
  reactions: Map<string, StoredReaction>;
}

export interface MemoryRepositoryOptions {
  now?: () => Date;
  generateId?: () => string;
  /**
   * The demo store keeps at most this many tweets and replies, dropping the
   * oldest first, so a flood of posts cannot exhaust the server's memory.
   */
  limits?: { tweets: number; replies: number };
}

const DEFAULT_LIMITS = { tweets: 2000, replies: 5000 };

const TREND_WINDOW = 500;

const key = (username: string) => username.toLowerCase();

const reactionKey = (kind: ReactionKind, tweetId: string, username: string) =>
  `${kind}:${tweetId}:${key(username)}`;

const toAuthor = ({ username, fullname, image }: IAuthor): IAuthor => ({
  username,
  fullname,
  image,
});

export function createMemoryState(seed: SeedData): MemoryState {
  const users = new Map(seed.users.map((user) => [key(user.username), user]));

  const authorOf = (username: string): IAuthor => {
    const user = users.get(key(username));
    if (!user) throw new Error(`Seed references unknown user "${username}"`);
    return toAuthor(user);
  };

  return {
    users,
    tweets: new Map(
      seed.tweets.map((tweet) => [
        tweet.id,
        {
          id: tweet.id,
          text: tweet.text,
          image: tweet.image,
          createdAt: tweet.createdAt,
          author: authorOf(tweet.author),
          blocked: tweet.blocked,
        },
      ])
    ),
    replies: seed.replies.map((reply) => ({
      id: reply.id,
      tweetId: reply.tweetId,
      text: reply.text,
      createdAt: reply.createdAt,
      author: authorOf(reply.author),
    })),
    reactions: new Map(
      seed.reactions.map((reaction) => [
        reactionKey(reaction.kind, reaction.tweetId, reaction.username),
        {
          kind: reaction.kind,
          tweetId: reaction.tweetId,
          actor: authorOf(reaction.username),
          createdAt: reaction.createdAt,
        },
      ])
    ),
  };
}

const globalStore = globalThis as typeof globalThis & {
  __superappMemoryState?: MemoryState;
};

/**
 * The process-wide demo store. It lives on `globalThis` so API routes and
 * `getServerSideProps` (separate bundles in Next.js) and hot reloads all share
 * one copy. Data resets when the server restarts.
 */
export function getMemoryState(): MemoryState {
  if (!globalStore.__superappMemoryState) {
    globalStore.__superappMemoryState = createMemoryState(createSeedData());
  }
  return globalStore.__superappMemoryState;
}

export function createMemoryRepository(
  state: MemoryState,
  {
    now = () => new Date(),
    generateId = randomUUID,
    limits = DEFAULT_LIMITS,
  }: MemoryRepositoryOptions = {}
): Repository {
  /** Deletes a tweet with its replies and reactions. */
  const removeTweet = (id: string) => {
    if (!state.tweets.delete(id)) return false;

    state.replies = state.replies.filter((reply) => reply.tweetId !== id);
    state.reactions.forEach((reaction, reactionId) => {
      if (reaction.tweetId === id) state.reactions.delete(reactionId);
    });
    return true;
  };

  const enforceLimits = () => {
    while (state.tweets.size > limits.tweets) {
      let oldest: StoredTweet | undefined;
      state.tweets.forEach((tweet) => {
        if (!oldest || compareNewestFirst(tweet, oldest) > 0) oldest = tweet;
      });
      if (!oldest) break;
      removeTweet(oldest.id);
    }
    if (state.replies.length > limits.replies) {
      state.replies.splice(0, state.replies.length - limits.replies);
    }
  };

  const visibleTweet = (id: string) => {
    const tweet = state.tweets.get(id);
    return tweet && !tweet.blocked ? tweet : undefined;
  };

  const hasReaction = (
    kind: ReactionKind,
    tweetId: string,
    username?: string | null
  ) => !!username && state.reactions.has(reactionKey(kind, tweetId, username));

  const toTweet = (tweet: StoredTweet, viewer?: string | null): ITweet => {
    let likes = 0;
    let retweets = 0;
    state.reactions.forEach((reaction) => {
      if (reaction.tweetId !== tweet.id) return;
      if (reaction.kind === "like") likes += 1;
      if (reaction.kind === "retweet") retweets += 1;
    });

    return {
      id: tweet.id,
      text: tweet.text,
      image: tweet.image,
      createdAt: tweet.createdAt,
      author: toAuthor(tweet.author),
      stats: {
        replies: state.replies.filter((reply) => reply.tweetId === tweet.id)
          .length,
        retweets,
        likes,
      },
      viewer: {
        liked: hasReaction("like", tweet.id, viewer),
        retweeted: hasReaction("retweet", tweet.id, viewer),
        bookmarked: hasReaction("bookmark", tweet.id, viewer),
      },
    };
  };

  const timeline = () =>
    Array.from(state.tweets.values())
      .filter((tweet) => !tweet.blocked)
      .sort(compareNewestFirst);

  return {
    source: "memory",

    async listTweets(query: ListTweetsQuery = {}) {
      const limit = clampLimit(query.limit);
      const cursor = decodeCursor(query.cursor);
      // Blank searches are ignored; punctuation-only ones ("!!!") match nothing.
      const searching = !!query.search?.trim();
      const terms = searchTerms(query.search ?? "");
      if (searching && terms.length === 0)
        return { items: [], nextCursor: null };

      const matches = timeline().filter((tweet) => {
        if (query.author && key(tweet.author.username) !== key(query.author))
          return false;
        if (
          query.bookmarkedBy &&
          !hasReaction("bookmark", tweet.id, query.bookmarkedBy)
        )
          return false;
        if (query.likedBy && !hasReaction("like", tweet.id, query.likedBy))
          return false;
        if (
          searching &&
          !matchesSearch(
            [tweet.text, tweet.author.username, tweet.author.fullname],
            terms
          )
        ) {
          return false;
        }
        return !cursor || isAfterCursor(tweet, cursor);
      });

      const page = matches.slice(0, limit);
      const last = page[page.length - 1];

      return {
        items: page.map((tweet) => toTweet(tweet, query.viewer)),
        nextCursor: matches.length > limit && last ? encodeCursor(last) : null,
      };
    },

    async getTweet(id, viewer) {
      const tweet = visibleTweet(id);
      return tweet ? toTweet(tweet, viewer) : null;
    },

    async createTweet({ text, image, author }: NewTweet) {
      const tweet: StoredTweet = {
        id: generateId(),
        text,
        image: image ?? null,
        createdAt: now().toISOString(),
        author: toAuthor(author),
        blocked: false,
      };
      state.tweets.set(tweet.id, tweet);
      enforceLimits();
      return toTweet(tweet, author.username);
    },

    async deleteTweet(id) {
      return removeTweet(id);
    },

    async listReplies(tweetId) {
      return state.replies
        .filter((reply) => reply.tweetId === tweetId)
        .sort((a, b) => compareNewestFirst(b, a))
        .map((reply) => ({ ...reply, author: toAuthor(reply.author) }));
    },

    async createReply({ tweetId, text, author }: NewReply) {
      if (!visibleTweet(tweetId)) throw new NotFoundError("Tweet not found");

      const reply: IReply = {
        id: generateId(),
        tweetId,
        text,
        createdAt: now().toISOString(),
        author: toAuthor(author),
      };
      state.replies.push(reply);
      enforceLimits();
      return { ...reply };
    },

    async setReaction(kind, tweetId, actor, active) {
      if (!visibleTweet(tweetId)) throw new NotFoundError("Tweet not found");

      const id = reactionKey(kind, tweetId, actor.username);
      if (!active) {
        state.reactions.delete(id);
      } else if (!state.reactions.has(id)) {
        state.reactions.set(id, {
          kind,
          tweetId,
          actor: toAuthor(actor),
          createdAt: now().toISOString(),
        });
      }
    },

    async getUser(username) {
      const tweets = timeline().filter(
        (tweet) => key(tweet.author.username) === key(username)
      );
      const user = state.users.get(key(username));

      if (user) return { ...user, tweetCount: tweets.length };

      // People who tweeted but have no profile record get one derived from
      // their most recent visible tweet, mirroring the Sanity implementation.
      // Moderated tweets never count, so their name and avatar stay hidden.
      if (tweets.length === 0) return null;

      const profile: IUserProfile = {
        ...toAuthor(tweets[0].author),
        bio: null,
        location: null,
        website: null,
        banner: null,
        verified: false,
        joinedAt: tweets[tweets.length - 1].createdAt,
        tweetCount: tweets.length,
      };
      return profile;
    },

    async listTrends(limit = DEFAULT_TRENDS_LIMIT) {
      const texts = timeline()
        .slice(0, TREND_WINDOW)
        .map((tweet) => tweet.text);
      return computeTrends(texts, limit);
    },

    async listNotifications(username, limit = DEFAULT_NOTIFICATIONS_LIMIT) {
      const mine = new Map(
        timeline()
          .filter((tweet) => key(tweet.author.username) === key(username))
          .map((tweet) => [tweet.id, tweet])
      );
      const notifications: INotification[] = [];

      state.reactions.forEach((reaction) => {
        const tweet = mine.get(reaction.tweetId);
        if (!tweet || reaction.kind === "bookmark") return;
        if (key(reaction.actor.username) === key(username)) return;

        notifications.push({
          id: `${reaction.kind}-${tweet.id}-${key(reaction.actor.username)}`,
          type: reaction.kind,
          createdAt: reaction.createdAt,
          actor: toAuthor(reaction.actor),
          tweet: { id: tweet.id, text: tweet.text },
          reply: null,
        });
      });

      for (const reply of state.replies) {
        const tweet = mine.get(reply.tweetId);
        if (!tweet || key(reply.author.username) === key(username)) continue;

        notifications.push({
          id: reply.id,
          type: "reply",
          createdAt: reply.createdAt,
          actor: toAuthor(reply.author),
          tweet: { id: tweet.id, text: tweet.text },
          reply: { id: reply.id, text: reply.text },
        });
      }

      return notifications
        .sort(compareNewestFirst)
        .slice(0, Math.max(0, limit));
    },
  };
}
