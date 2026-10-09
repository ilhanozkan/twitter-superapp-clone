import { IUser } from "../../../types/User";
import { ReactionKind } from "../../../types/Tweet";
import { SeedContext, SeedReaction, SeedReply, SeedTweet } from "./types";

// The "core" world: the users, Tweets, replies and reactions the app had
// before the SuperApp features. Its ids, counts and timings are what the
// core contract suite and the route tests assert, so it never changes.

const MINUTE = 60_000;

/** The account the demo is browsed as (the repository owner). */
export const DEMO_USERNAME = "illlhanozkan";

const users: IUser[] = [
  {
    username: "illlhanozkan",
    fullname: "Ilhan Ozkan",
    image: "/avatars/illlhanozkan.svg",
    banner: "/media/banner-illlhanozkan.svg",
    bio: "Software Developer · Building Twitter SuperApp 🚀",
    location: "Turkey",
    website: "https://ilhanozkan.com",
    verified: false,
    accountType: "personal",
    joinedAt: "2020-06-28T12:41:15.000Z",
  },
  {
    username: "superapp",
    fullname: "Twitter SuperApp",
    image: "/avatars/superapp.svg",
    banner: null,
    bio: "The everything app, one tweet at a time. Payments, rides and food delivery are on the roadmap.",
    location: null,
    website: "https://github.com/ilhanozkan/twitter-superapp-clone",
    verified: true,
    accountType: "personal",
    joinedAt: "2022-10-25T15:54:23.000Z",
  },
  {
    username: "sarahcodes",
    fullname: "Sarah Chen",
    image: "/avatars/sarahcodes.svg",
    banner: "/media/banner-sarahcodes.svg",
    bio: "Frontend engineer. React, accessibility & good coffee.",
    location: "San Francisco, CA",
    website: null,
    verified: true,
    accountType: "personal",
    joinedAt: "2015-03-14T09:00:00.000Z",
  },
  {
    username: "devmarco",
    fullname: "Marco Rossi",
    image: "/avatars/devmarco.svg",
    banner: null,
    bio: "Backend dev. Go, Postgres, distributed systems. Opinions are my own.",
    location: "Milan, Italy",
    website: null,
    verified: false,
    accountType: "personal",
    joinedAt: "2012-09-02T18:30:00.000Z",
  },
  {
    username: "ayse_design",
    fullname: "Ayşe Yılmaz",
    image: "/avatars/ayse_design.svg",
    banner: null,
    bio: "Product designer at a fintech. Design systems nerd.",
    location: "İstanbul",
    website: null,
    verified: false,
    accountType: "personal",
    joinedAt: "2017-01-20T11:15:00.000Z",
  },
  {
    username: "nightowl_dev",
    fullname: "Priya Nair",
    image: "/avatars/nightowl_dev.svg",
    banner: null,
    bio: "ML engineer. I write code at 2am so you don't have to.",
    location: "Bengaluru, India",
    website: null,
    verified: false,
    accountType: "personal",
    joinedAt: "2019-11-05T22:45:00.000Z",
  },
  {
    username: "foodie_ankara",
    fullname: "Mert Demir",
    image: "/avatars/foodie_ankara.svg",
    banner: null,
    bio: "Eating my way through Ankara. Coffee > sleep.",
    location: "Ankara",
    website: null,
    verified: false,
    accountType: "personal",
    joinedAt: "2021-04-11T08:00:00.000Z",
  },
  {
    username: "lenaframes",
    fullname: "Lena Hoffmann",
    image: "/avatars/lenaframes.svg",
    banner: "/media/banner-lenaframes.svg",
    bio: "Landscape & city photographer 📷",
    location: "Berlin",
    website: null,
    verified: false,
    accountType: "personal",
    joinedAt: "2016-06-30T16:20:00.000Z",
  },
];

// [id, author, minutes ago, text, image?, blocked?]
type TweetRow = [string, string, number, string, string?, boolean?];

const tweetRows: TweetRow[] = [
  [
    "seed-t01",
    "superapp",
    12,
    "Welcome to Twitter SuperApp 👋 Tweet, reply, like and bookmark today. Wallets, rides and food delivery are next on the roadmap. #SuperApp",
  ],
  [
    "seed-t02",
    "sarahcodes",
    38,
    "Hot take: every icon-only button needs an aria-label. Your screen reader users will thank you. #a11y #React",
  ],
  [
    "seed-t03",
    "lenaframes",
    80,
    "Sunrise over the Dolomites this morning. Worth the 4am alarm. #Photography",
    "/media/mountains.svg",
  ],
  [
    "seed-t04",
    "devmarco",
    2 * 60,
    "Cursor pagination > offset pagination. Stable pages even while new rows are being inserted. Fight me. #Backend",
  ],
  [
    "seed-t05",
    "illlhanozkan",
    3 * 60,
    "Rebuilt the data layer of the SuperApp with a repository pattern: Sanity in production, an in-memory store for local dev. #NextJS #TypeScript",
    "/media/code.svg",
  ],
  [
    "seed-t06",
    "foodie_ankara",
    4 * 60,
    "Nothing beats a Turkish coffee after lunch ☕ Who's building the food delivery feature so I can order this from a tweet? #SuperApp #Coffee",
    "/media/coffee.svg",
  ],
  [
    "seed-t07",
    "nightowl_dev",
    6 * 60,
    'Trained a tiny model that ranks timelines by "how likely you are to reply". It mostly recommends arguments. Back to the drawing board. #AI',
  ],
  [
    "seed-t08",
    "ayse_design",
    7 * 60,
    "Design systems are 20% components and 80% saying no to one-off variants. #Design",
  ],
  [
    "seed-t09",
    "sarahcodes",
    9 * 60,
    "React 19 with the Next.js pages router is still a great combo for apps like this. Not everything needs to be a server component. #React #NextJS",
  ],
  [
    "seed-t10",
    "lenaframes",
    11 * 60,
    "Berlin blue hour from the rooftop. #Photography #Berlin",
    "/media/skyline.svg",
  ],
  [
    "seed-t11",
    "devmarco",
    14 * 60,
    "Idempotent APIs make retries boring. Boring is good. PUT /like twice and you still have one like. #Backend",
  ],
  [
    "seed-t12",
    "illlhanozkan",
    20 * 60,
    "What should the SuperApp ship first? Reply with your vote:\n💸 payments\n🚗 rides\n🍔 food\n📺 live #SuperApp",
  ],
  [
    "seed-t13",
    "ayse_design",
    26 * 60,
    "İstanbul'da yağmur, kahve ve Figma. Perfect Sunday. #Istanbul #Design",
  ],
  [
    "seed-t14",
    "nightowl_dev",
    29 * 60,
    "Reminder: your test suite is a product too. Make it fast or people will stop running it. #TypeScript",
  ],
  [
    "seed-t15",
    "superapp",
    2 * 24 * 60,
    "Roadmap update: account balances and payments over DMs are being designed now. Follow along! #SuperApp",
  ],
  [
    "seed-t16",
    "foodie_ankara",
    2 * 24 * 60 + 180,
    "Best lahmacun in Ankara? Asking for a friend (the friend is me). #Food",
  ],
  [
    "seed-t17",
    "sarahcodes",
    3 * 24 * 60,
    "Tailwind tip: semantic color tokens backed by CSS variables make dark mode almost free. #CSS",
  ],
  [
    "seed-t18",
    "devmarco",
    4 * 24 * 60,
    "Shipped a migration with zero downtime today. Expand, migrate, contract. Every. Time. #Backend",
  ],
  [
    "seed-t19",
    "illlhanozkan",
    6 * 24 * 60,
    "hello world 👋 the first tweet from the SuperApp clone #100DaysOfCode",
  ],
  [
    "seed-t20",
    "lenaframes",
    8 * 24 * 60,
    'New series coming soon: "Cities at night". #Photography',
  ],
  // Hidden by moderation (blockTweet): must never be listed.
  [
    "seed-t99",
    "nightowl_dev",
    45,
    "This tweet was hidden by a moderator.",
    undefined,
    true,
  ],
];

// [id, tweet id, author, minutes ago, text]
type ReplyRow = [string, string, string, number, string];

const replyRows: ReplyRow[] = [
  [
    "seed-r01",
    "seed-t01",
    "sarahcodes",
    10,
    "Congrats on the launch! Bookmarks are exactly what I needed.",
  ],
  ["seed-r02", "seed-t01", "foodie_ankara", 8, "Food delivery when? 🍔"],
  [
    "seed-r03",
    "seed-t05",
    "devmarco",
    170,
    "Nice. Did you make the reactions idempotent? Deterministic document ids make that easy in Sanity.",
  ],
  [
    "seed-r04",
    "seed-t05",
    "illlhanozkan",
    160,
    "@devmarco Yep: like-<tweet>-<user> ids, so liking twice is a no-op.",
  ],
  ["seed-r05", "seed-t12", "nightowl_dev", 19 * 60, "💸 payments, obviously"],
  [
    "seed-r06",
    "seed-t12",
    "ayse_design",
    18 * 60,
    "🚗 rides! I'll design the booking flow.",
  ],
  [
    "seed-r07",
    "seed-t12",
    "foodie_ankara",
    17 * 60,
    "🍔 food. This is not a debate.",
  ],
  ["seed-r08", "seed-t03", "ayse_design", 70, "Those colors are unreal 😍"],
  ["seed-r09", "seed-t19", "superapp", 6 * 24 * 60 - 30, "Welcome aboard! 🚀"],
  [
    "seed-r10",
    "seed-t09",
    "devmarco",
    8 * 60,
    "Agreed. Ship the boring stack.",
  ],
];

// tweet id -> usernames, in the order the reactions happened
const likes: Record<string, string[]> = {
  "seed-t01": [
    "sarahcodes",
    "devmarco",
    "ayse_design",
    "nightowl_dev",
    "foodie_ankara",
    "lenaframes",
  ],
  "seed-t02": ["illlhanozkan", "ayse_design", "nightowl_dev"],
  "seed-t03": [
    "illlhanozkan",
    "sarahcodes",
    "ayse_design",
    "superapp",
    "foodie_ankara",
  ],
  "seed-t04": ["nightowl_dev", "sarahcodes"],
  "seed-t05": ["sarahcodes", "devmarco", "ayse_design", "nightowl_dev"],
  "seed-t06": ["superapp", "lenaframes"],
  "seed-t07": ["devmarco", "sarahcodes", "ayse_design"],
  "seed-t08": ["sarahcodes", "lenaframes"],
  "seed-t09": ["illlhanozkan", "devmarco", "nightowl_dev"],
  "seed-t10": ["ayse_design", "sarahcodes", "foodie_ankara"],
  "seed-t11": ["nightowl_dev"],
  "seed-t12": ["superapp", "sarahcodes", "foodie_ankara"],
  "seed-t13": ["lenaframes"],
  "seed-t15": ["illlhanozkan", "foodie_ankara"],
  "seed-t17": ["ayse_design"],
  "seed-t19": ["lenaframes", "superapp"],
};

const retweets: Record<string, string[]> = {
  "seed-t01": ["illlhanozkan", "devmarco"],
  "seed-t03": ["ayse_design"],
  "seed-t05": ["superapp", "sarahcodes"],
  "seed-t07": ["devmarco"],
  "seed-t12": ["superapp"],
};

const bookmarks: Record<string, string[]> = {
  "seed-t04": ["illlhanozkan"],
  "seed-t11": ["illlhanozkan"],
  "seed-t17": ["illlhanozkan", "ayse_design"],
};

export interface CoreSeed {
  users: IUser[];
  tweets: SeedTweet[];
  replies: SeedReply[];
  reactions: SeedReaction[];
}

/** Today's dataset, with timestamps relative to `ctx.now`. */
export function createCoreSeed({ now, at }: SeedContext): CoreSeed {
  const tweets: SeedTweet[] = tweetRows.map(
    ([id, author, minutesAgo, text, image, blocked]) => ({
      id,
      text,
      image: image ?? null,
      createdAt: at(minutesAgo),
      author,
      blocked: blocked ?? false,
    })
  );

  const replies: SeedReply[] = replyRows.map(
    ([id, tweetId, author, minutesAgo, text]) => ({
      id,
      tweetId,
      text,
      createdAt: at(minutesAgo),
      author,
    })
  );

  const tweetTime = new Map(tweets.map((t) => [t.id, Date.parse(t.createdAt)]));
  const reactions: SeedReaction[] = [];

  const addReactions = (
    kind: ReactionKind,
    byTweet: Record<string, string[]>
  ) => {
    for (const [tweetId, usernames] of Object.entries(byTweet)) {
      const postedAt = tweetTime.get(tweetId)!;
      usernames.forEach((username, index) => {
        // Spread reactions after the tweet was posted, never in the future.
        const time = Math.min(
          postedAt + (index + 1) * 4 * MINUTE,
          now.getTime() - MINUTE
        );
        reactions.push({
          kind,
          tweetId,
          username,
          createdAt: new Date(Math.max(time, postedAt)).toISOString(),
        });
      });
    }
  };

  addReactions("like", likes);
  addReactions("retweet", retweets);
  addReactions("bookmark", bookmarks);

  return {
    users: users.map((user) => ({ ...user })),
    tweets,
    replies,
    reactions,
  };
}
