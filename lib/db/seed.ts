import { IAuthor, IUser } from "../../types/User";
import { BusinessSeed, createBusinessSeed } from "./seeds/business";
import { createCoreSeed } from "./seeds/core";
import { createMessagesSeed, MessagesSeed } from "./seeds/messages";
import { createOrdersSeed, OrdersSeed } from "./seeds/orders";
import { createRidesSeed, RidesSeed } from "./seeds/rides";
import { createShopSeed, ShopSeed } from "./seeds/shop";
import { createStoriesSeed, StoriesSeed } from "./seeds/stories";
import {
  SeedContext,
  SeedContribution,
  SeedReaction,
  SeedReply,
  SeedTweet,
} from "./seeds/types";
import { superappUsers } from "./seeds/users";
import {
  composeWalletSeed,
  createWalletSeed,
  WalletSeed,
} from "./seeds/wallet";

export { DEMO_USERNAME } from "./seeds/core";
export type { SeedReaction, SeedReply, SeedTweet } from "./seeds/types";

/**
 * "core" is the app's data before the SuperApp features, unchanged: the core
 * contract suite and route tests assert it. "superapp" adds every feature's
 * seed on top.
 */
export type SeedWorld = "core" | "superapp";

/** Each feature's own seed records; lanes that ship no seed leave theirs null. */
export interface SuperappSeed {
  wallet: WalletSeed;
  business: BusinessSeed;
  shop: ShopSeed | null;
  orders: OrdersSeed | null;
  rides: RidesSeed | null;
  stories: StoriesSeed | null;
  messages: MessagesSeed | null;
}

export interface SeedData {
  users: IUser[];
  tweets: SeedTweet[];
  replies: SeedReply[];
  reactions: SeedReaction[];
  /** null in the core world. */
  superapp: SuperappSeed | null;
}

const MINUTE = 60_000;

export function seedContext(now: Date): SeedContext {
  return {
    now,
    at: (minutesAgo) =>
      new Date(now.getTime() - minutesAgo * MINUTE).toISOString(),
  };
}

/**
 * Builds the demo dataset with timestamps relative to `now`, so the feed
 * always looks recent ("12m", "3h", "2d") no matter when the app starts.
 *
 * The superapp world merges every lane's contribution into the shared
 * Tweets, replies and reactions, and folds all contributed transfers in
 * time order into wallet balances. Seeds always use time scale 1.
 */
export function createSeedData(
  now: Date = new Date(),
  { world }: { world: SeedWorld } = { world: "superapp" }
): SeedData {
  const ctx = seedContext(now);
  const core = createCoreSeed(ctx);
  if (world === "core") return { ...core, superapp: null };

  const wallet = createWalletSeed(ctx);
  const business = createBusinessSeed(ctx);
  const shop = createShopSeed(ctx);
  const orders = createOrdersSeed(ctx);
  const rides = createRidesSeed(ctx);
  const stories = createStoriesSeed(ctx);
  const messages = createMessagesSeed(ctx);
  const contributions: SeedContribution[] = [
    wallet,
    business,
    shop,
    orders,
    rides,
    stories,
    messages,
  ].map((seed) => seed.contribution);

  // An account is a business exactly when it has a business profile.
  const businesses = new Set(
    (business.data?.profiles ?? []).map((profile) =>
      profile.username.toLowerCase()
    )
  );
  const users: IUser[] = [...core.users, ...superappUsers].map((user) => ({
    ...user,
    accountType: businesses.has(user.username.toLowerCase())
      ? "business"
      : "personal",
  }));

  const byUsername = new Map(
    users.map((user) => [user.username.toLowerCase(), user])
  );
  const authorOf = (username: string): IAuthor => {
    const user = byUsername.get(username.toLowerCase());
    if (!user) throw new Error(`Seed references unknown user "${username}"`);
    return {
      username: user.username,
      fullname: user.fullname,
      image: user.image,
    };
  };

  return {
    users,
    tweets: [
      ...core.tweets,
      ...contributions.flatMap((part) => part.tweets ?? []),
    ],
    replies: [
      ...core.replies,
      ...contributions.flatMap((part) => part.replies ?? []),
    ],
    reactions: [
      ...core.reactions,
      ...contributions.flatMap((part) => part.reactions ?? []),
    ],
    superapp: {
      wallet: composeWalletSeed(
        contributions.flatMap((part) => part.transfers ?? []),
        authorOf
      ),
      business: business.data ?? { profiles: [] },
      shop: shop.data,
      orders: orders.data,
      rides: rides.data,
      stories: stories.data,
      messages: messages.data,
    },
  };
}
