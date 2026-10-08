import { IUser } from "../../../types/User";
import { SeedData } from "../seed";
import { reactionDocumentId } from "./repository";

export interface SanitySeedDocument {
  _id: string;
  _type: string;
  _createdAt: string;
  [field: string]: unknown;
}

/** Drops null/undefined fields; Sanity stores "no value" as an absent field. */
function compact<T extends Record<string, unknown>>(document: T): T {
  return Object.fromEntries(
    Object.entries(document).filter(
      ([, value]) => value !== null && value !== undefined
    )
  ) as T;
}

/**
 * Converts the demo dataset into Sanity documents with the same shapes the
 * app writes, so it can be imported with `sanity dataset import`.
 */
export function seedToSanityDocuments(seed: SeedData): SanitySeedDocument[] {
  const users = new Map(
    seed.users.map((user) => [user.username.toLowerCase(), user])
  );
  const userOf = (username: string): IUser => {
    const user = users.get(username.toLowerCase());
    if (!user) throw new Error(`Seed references unknown user "${username}"`);
    return user;
  };

  const userDocuments = seed.users.map((user) =>
    compact({
      _id: `user-${user.username.toLowerCase()}`,
      _type: "user",
      _createdAt: user.joinedAt,
      username: user.username,
      fullname: user.fullname,
      image: user.image,
      banner: user.banner,
      bio: user.bio,
      location: user.location,
      website: user.website,
      verified: user.verified,
      joinedAt: user.joinedAt,
    })
  );

  const tweetDocuments = seed.tweets.map((tweet) => {
    const author = userOf(tweet.author);
    return compact({
      _id: tweet.id,
      _type: "tweet",
      _createdAt: tweet.createdAt,
      tweet: tweet.text,
      username: author.username,
      fullname: author.fullname,
      userImage: author.image,
      tweetImage: tweet.image,
      blockTweet: tweet.blocked,
    });
  });

  const commentDocuments = seed.replies.map((reply) => {
    const author = userOf(reply.author);
    return compact({
      _id: reply.id,
      _type: "comment",
      _createdAt: reply.createdAt,
      comment: reply.text,
      username: author.username,
      fullname: author.fullname,
      profileImg: author.image,
      tweet: { _type: "reference", _ref: reply.tweetId },
    });
  });

  const reactionDocuments = seed.reactions.map((reaction) => {
    const actor = userOf(reaction.username);
    return compact({
      _id: reactionDocumentId(reaction.kind, reaction.tweetId, actor.username),
      _type: reaction.kind,
      _createdAt: reaction.createdAt,
      tweet: { _type: "reference", _ref: reaction.tweetId, _weak: true },
      username: actor.username,
      fullname: actor.fullname,
      userImage: actor.image,
    });
  });

  return [
    ...userDocuments,
    ...tweetDocuments,
    ...commentDocuments,
    ...reactionDocuments,
  ];
}
