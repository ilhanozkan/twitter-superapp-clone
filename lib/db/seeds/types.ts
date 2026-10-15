import { PendingTransfer } from "../../superapp/ledger";
import { ReactionKind, TweetAttachmentInput } from "../../../types/Tweet";

export interface SeedTweet {
  id: string;
  text: string;
  image: string | null;
  createdAt: string;
  author: string;
  blocked: boolean;
  attachment?: TweetAttachmentInput | null;
}

export interface SeedReply {
  id: string;
  tweetId: string;
  text: string;
  createdAt: string;
  author: string;
}

export interface SeedReaction {
  kind: ReactionKind;
  tweetId: string;
  username: string;
  createdAt: string;
}

/** Seeds are dated relative to `now`, so the demo always looks recent. */
export interface SeedContext {
  now: Date;
  at(minutesAgo: number): string;
}

/** A transfer in seed form: parties are usernames, resolved when the world is composed. */
export interface SeedTransfer extends Omit<PendingTransfer, "from" | "to"> {
  from: string | null;
  to: string;
  createdAt: string;
  requestHash?: never;
}

/** What a lane adds to the shared parts of the world. */
export interface SeedContribution {
  tweets?: SeedTweet[];
  replies?: SeedReply[];
  reactions?: SeedReaction[];
  transfers?: SeedTransfer[];
}

/**
 * What every lane seed file's `create<Feature>Seed(ctx)` returns: the lane's
 * own records (`data`) plus its contribution to the shared parts.
 */
export interface LaneSeed<T> {
  data: T | null;
  contribution: SeedContribution;
}
