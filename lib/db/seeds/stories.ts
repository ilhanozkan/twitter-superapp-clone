import { STORY_TTL_MS } from "../../superapp/stories";
import { StoryContent } from "../../../types/Story";
import { IAuthor } from "../../../types/User";
import { StoryRecord, StoryViewRecord } from "../stories/records";
import { createCoreSeed, DEMO_USERNAME } from "./core";
import { LaneSeed, SeedContext } from "./types";
import { superappUsers } from "./users";

export interface StoriesSeed {
  stories: StoryRecord[];
  views: StoryViewRecord[];
}

// [id, author, minutes ago, content]
type StoryRow = [string, string, number, StoryContent];

const storyRows: StoryRow[] = [
  [
    "seed-story01",
    "superapp",
    60,
    {
      type: "text",
      text: "Wallets are live 💸 Tap Services to try payments, food and rides.",
      background: "blue",
    },
  ],
  [
    "seed-story02",
    "kizilaykahve",
    180,
    {
      type: "image",
      image: "/media/stories/latte.svg",
      alt: "A pistachio latte in a tall glass, a leaf drawn in the green foam",
      caption: "Today's special 🟢",
    },
  ],
  [
    "seed-story03",
    "foodie_ankara",
    300,
    {
      type: "image",
      image: "/media/coffee.svg",
      alt: "A cup of Turkish coffee",
      caption: "Afternoon fuel",
    },
  ],
  [
    "seed-story04",
    "foodie_ankara",
    120,
    {
      type: "text",
      text: "Lahmacun crawl tonight. Who's in? 🌯",
      background: "orange",
    },
  ],
  [
    "seed-story05",
    "lenaframes",
    480,
    {
      type: "image",
      image: "/media/mountains.svg",
      alt: "Sunrise over mountain peaks",
      caption: "Dolomites, 5:42am",
    },
  ],
  [
    "seed-story06",
    "sarahcodes",
    1200,
    {
      type: "text",
      text: "Shipping a11y fixes all day. Coffee count: 3 ☕",
      background: "purple",
    },
  ],
  [
    "seed-story07",
    DEMO_USERNAME,
    360,
    {
      type: "text",
      text: "Building the SuperApp in public 🚀",
      background: "green",
    },
  ],
];

// [story, viewer, minutes ago]: the demo user has seen Lena's story, and
// three people have seen the demo user's.
const viewRows: [string, string, number][] = [
  ["seed-story05", DEMO_USERNAME, 420],
  ["seed-story07", "sarahcodes", 330],
  ["seed-story07", "devmarco", 240],
  ["seed-story07", "superapp", 90],
];

/**
 * Six accounts with stories. Seeded stories all expire 24 hours after the
 * seed is made, whatever their age, so a fresh demo always shows the full
 * tray. The memory store seeds when the server starts (a restart brings
 * them back); Sanity stores what `npm run seed:sanity` exported, so there
 * they last 24 hours from the export (docs/api/stories.md).
 */
export function createStoriesSeed(ctx: SeedContext): LaneSeed<StoriesSeed> {
  const people = new Map(
    [...createCoreSeed(ctx).users, ...superappUsers].map((user) => [
      user.username.toLowerCase(),
      user,
    ])
  );
  const authorOf = (username: string): IAuthor => {
    const user = people.get(username.toLowerCase());
    if (!user) {
      throw new Error(`Story seed references unknown user "${username}"`);
    }
    return {
      username: user.username,
      fullname: user.fullname,
      image: user.image,
    };
  };
  const expiresAt = new Date(ctx.now.getTime() + STORY_TTL_MS).toISOString();

  return {
    data: {
      stories: storyRows.map(([id, author, minutesAgo, content]) => ({
        id,
        author: authorOf(author),
        content,
        createdAt: ctx.at(minutesAgo),
        expiresAt,
        blocked: false,
      })),
      views: viewRows.map(([storyId, viewer, minutesAgo]) => ({
        storyId,
        viewer: authorOf(viewer),
        createdAt: ctx.at(minutesAgo),
      })),
    },
    contribution: {},
  };
}
