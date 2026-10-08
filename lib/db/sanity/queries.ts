// GROQ for the Sanity repository. Field names follow the documents already
// stored in the "production" dataset (tweet.tweet, tweet.userImage,
// comment.comment, comment.profileImg, ...) so existing content keeps working.

/** Visible tweets. `!= true` (not `!blockTweet`) so tweets without the flag still show. */
export const TWEET_FILTER = `_type == "tweet" && blockTweet != true`;

const author = (imageField: string) =>
  `{ "username": username, "fullname": coalesce(fullname, username), "image": ${imageField} }`;

const reactionCount = (type: string, extra = "") =>
  `count(*[_type == "${type}" && tweet._ref == ^._id${extra}])`;

const viewerReacted = (type: string) =>
  `${reactionCount(type, " && lower(username) == $viewer")} > 0`;

/** Expects a lower-cased `$viewer` param ("" when anonymous). */
export const TWEET_PROJECTION = `{
  "id": _id,
  "text": coalesce(tweet, ""),
  "image": tweetImage,
  "createdAt": _createdAt,
  "author": ${author("userImage")},
  "stats": {
    "replies": ${reactionCount("comment")},
    "retweets": ${reactionCount("retweet")},
    "likes": ${reactionCount("like")}
  },
  "viewer": {
    "liked": ${viewerReacted("like")},
    "retweeted": ${viewerReacted("retweet")},
    "bookmarked": ${viewerReacted("bookmark")}
  }
}`;

export const REPLY_PROJECTION = `{
  "id": _id,
  "tweetId": tweet._ref,
  "text": coalesce(comment, ""),
  "createdAt": _createdAt,
  "author": ${author("profileImg")}
}`;

export interface TweetListFilters {
  author?: boolean;
  search?: boolean;
  bookmarkedBy?: boolean;
  likedBy?: boolean;
  cursor?: boolean;
}

/**
 * Builds the timeline query. Only the clauses that are needed are included;
 * their values are always passed as params, never interpolated. `fetchCount`
 * is a validated integer (page size + 1 to detect a next page).
 */
export function tweetListQuery(
  filters: TweetListFilters,
  fetchCount: number
): string {
  const clauses = [TWEET_FILTER];

  if (filters.author) clauses.push("lower(username) == $author");
  if (filters.search) {
    clauses.push(
      "(tweet match $search || username match $search || fullname match $search)"
    );
  }
  if (filters.bookmarkedBy) {
    clauses.push(
      `_id in *[_type == "bookmark" && lower(username) == $bookmarkedBy].tweet._ref`
    );
  }
  if (filters.likedBy) {
    clauses.push(
      `_id in *[_type == "like" && lower(username) == $likedBy].tweet._ref`
    );
  }
  if (filters.cursor) {
    clauses.push(
      "(dateTime(_createdAt) < dateTime($cursorCreatedAt) || " +
        "(dateTime(_createdAt) == dateTime($cursorCreatedAt) && _id < $cursorId))"
    );
  }

  return `*[${clauses.join(
    " && "
  )}] | order(_createdAt desc, _id desc) [0...${fetchCount}] ${TWEET_PROJECTION}`;
}

export const TWEET_BY_ID_QUERY = `*[${TWEET_FILTER} && _id == $id][0] ${TWEET_PROJECTION}`;

export const VISIBLE_TWEET_ID_QUERY = `*[${TWEET_FILTER} && _id == $id][0]._id`;

/**
 * The tweet (only if it is a tweet) and the replies and reactions pointing at
 * it. Scoped by type so a user or reply id can never be deleted as a tweet.
 */
export const TWEET_AND_REFERENCES_QUERY = `{
  "tweet": *[_type == "tweet" && _id == $id][0]._id,
  "references": *[_type in ["comment", "like", "retweet", "bookmark"] && references($id)]._id
}`;

export const REPLIES_QUERY = `*[_type == "comment" && tweet._ref == $tweetId] | order(_createdAt asc, _id asc) ${REPLY_PROJECTION}`;

export const USER_QUERY = `{
  "user": *[_type == "user" && lower(username) == $username][0] {
    "username": username,
    "fullname": coalesce(fullname, username),
    "image": image,
    "banner": banner,
    "bio": bio,
    "location": location,
    "website": website,
    "verified": coalesce(verified, false),
    "joinedAt": coalesce(joinedAt, _createdAt)
  },
  "latest": *[${TWEET_FILTER} && lower(username) == $username] | order(_createdAt desc)[0] ${author(
  "userImage"
)},
  "firstTweetAt": *[${TWEET_FILTER} && lower(username) == $username] | order(_createdAt asc)[0]._createdAt,
  "tweetCount": count(*[${TWEET_FILTER} && lower(username) == $username])
}`;

export const trendTextsQuery = (window: number) =>
  `*[${TWEET_FILTER}] | order(_createdAt desc) [0...${window}].tweet`;

const MY_TWEET_IDS = `*[${TWEET_FILTER} && lower(username) == $username]._id`;

export const notificationsQuery = (limit: number) => `{
  "reactions": *[_type in ["like", "retweet"] && lower(username) != $username && tweet._ref in ${MY_TWEET_IDS}] | order(_createdAt desc) [0...${limit}] {
    "id": _id,
    "type": _type,
    "createdAt": _createdAt,
    "actor": ${author("userImage")},
    "tweet": tweet->{ "id": _id, "text": coalesce(tweet, "") },
    "reply": null
  },
  "replies": *[_type == "comment" && lower(username) != $username && tweet._ref in ${MY_TWEET_IDS}] | order(_createdAt desc) [0...${limit}] {
    "id": _id,
    "type": "reply",
    "createdAt": _createdAt,
    "actor": ${author("profileImg")},
    "tweet": tweet->{ "id": _id, "text": coalesce(tweet, "") },
    "reply": { "id": _id, "text": coalesce(comment, "") }
  }
}`;
