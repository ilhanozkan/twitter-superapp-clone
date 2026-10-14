import {
  channelConversationId,
  directConversationId,
  greetingMessageId,
} from "../../superapp/messages";
import { ChannelRole } from "../../../types/Message";
import { IAuthor } from "../../../types/User";
import {
  ConversationRecord,
  MemberRecord,
  MessageContent,
  MessageRecord,
} from "../messages/records";
import { createBusinessSeed } from "./business";
import { createCoreSeed, DEMO_USERNAME } from "./core";
import { LaneSeed, SeedContext } from "./types";
import { superappUsers } from "./users";

// The demo user's direct conversations (§14.3). The money bubbles point at
// F's wallet seed: Sarah's pending request seed-req01, Marco's payment
// seed-tx03 and the paid request seed-req02, each dated like its record.
// Only Sarah's conversation is unread, so the Messages badge starts at 1.
//
// The channels (§14.3, B2) live here too, on the same engine:
// #superapp_builders, which the demo user moderates (seed-msg-sab-04 is
// e2e/channels.spec.ts's to remove), and #ankara_eats, which the demo user
// hasn't joined. Channel messages carry no mentions, hashtags or links, so
// no link sits right under a group's author line.

export interface MessagesSeed {
  conversations: ConversationRecord[];
  members: MemberRecord[];
  /** Oldest first. */
  messages: MessageRecord[];
}

const HOUR = 60;
const DAY = 24 * HOUR;

const text = (value: string): MessageContent => ({
  type: "text",
  text: value,
  tweetId: null,
  storyId: null,
  storyAuthor: null,
});

type Line = [id: string, from: string, minutesAgo: number, MessageContent];

export const createMessagesSeed: (
  ctx: SeedContext
) => LaneSeed<MessagesSeed> = (ctx) => {
  const { at } = ctx;
  const people = new Map(
    [...createCoreSeed(ctx).users, ...superappUsers].map((user) => [
      user.username.toLowerCase(),
      user,
    ])
  );
  const authorOf = (username: string): IAuthor => {
    const user = people.get(username.toLowerCase());
    if (!user) throw new Error(`Messages seed names unknown "${username}"`);
    return {
      username: user.username,
      fullname: user.fullname,
      image: user.image,
    };
  };
  const greeting = createBusinessSeed(ctx).data?.profiles.find(
    (profile) => profile.username === "kizilaykahve"
  )?.greeting;
  if (!greeting) throw new Error("Kızılay Kahve's greeting is missing");

  const conversations: ConversationRecord[] = [];
  const members: MemberRecord[] = [];
  const messages: MessageRecord[] = [];

  /**
   * A conversation the demo user opened with `other` `openedAgo` minutes
   * ago; `readAgo` is when each side last read it.
   */
  const conversation = (
    other: string,
    openedAgo: number,
    readAgo: { demo: number; other: number },
    lines: Line[]
  ) => {
    const id = directConversationId(DEMO_USERNAME, other);
    conversations.push({ id, kind: "direct", createdAt: at(openedAgo) });
    for (const [username, readMinutesAgo] of [
      [DEMO_USERNAME, readAgo.demo],
      [other, readAgo.other],
    ] as const) {
      members.push({
        conversationId: id,
        user: authorOf(username),
        role: "member",
        joinedAt: at(openedAgo),
        lastReadAt: at(readMinutesAgo),
      });
    }
    for (const [messageId, from, minutesAgo, content] of lines) {
      messages.push({
        id: messageId,
        conversationId: id,
        author: authorOf(from),
        createdAt: at(minutesAgo),
        content,
        removed: null,
        requestHash: null,
      });
    }
  };

  conversation(
    "sarahcodes",
    2 * DAY + 5,
    // The demo user hasn't seen Sarah's request yet.
    { demo: 2 * DAY - 10, other: 5 * HOUR },
    [
      [
        "seed-msg-sarah-01",
        "sarahcodes",
        2 * DAY,
        text("Friday coffee at Kızılay Kahve? ☕"),
      ],
      [
        "seed-msg-sarah-02",
        DEMO_USERNAME,
        2 * DAY - 10,
        text("Yes! My treat next time"),
      ],
      [
        "seed-msg-sarah-03",
        "sarahcodes",
        5 * HOUR,
        { type: "request", requestId: "seed-req01" },
      ],
    ]
  );

  conversation("devmarco", 3 * HOUR + 1, { demo: 170, other: 160 }, [
    [
      "seed-msg-marco-01",
      "devmarco",
      3 * HOUR,
      {
        type: "payment",
        transferId: "seed-tx03",
        amount: 1_500,
        note: "Thanks for the code review 🙏",
      },
    ],
    ["seed-msg-marco-02", DEMO_USERNAME, 170, text("Anytime! 🙌")],
  ]);

  conversation(
    "kizilaykahve",
    3 * DAY,
    { demo: 3 * DAY - 15, other: 3 * DAY - 12 },
    [
      [
        greetingMessageId(directConversationId(DEMO_USERNAME, "kizilaykahve")),
        "kizilaykahve",
        3 * DAY,
        text(greeting),
      ],
      [
        "seed-msg-kahve-01",
        DEMO_USERNAME,
        3 * DAY - 2,
        text("Do you have oat milk?"),
      ],
      [
        "seed-msg-kahve-02",
        "kizilaykahve",
        3 * DAY - 12,
        text("We do! Oat, almond and lactose-free."),
      ],
    ]
  );

  conversation(
    "ayse_design",
    26 * HOUR + 1,
    { demo: 25 * HOUR - 10, other: 25 * HOUR },
    [
      [
        "seed-msg-ayse-01",
        DEMO_USERNAME,
        26 * HOUR,
        { type: "request", requestId: "seed-req02" },
      ],
      [
        "seed-msg-ayse-02",
        "ayse_design",
        25 * HOUR,
        text("Paid ✅ that pizza was worth it"),
      ],
    ]
  );

  /**
   * A channel `owner` created `createdAgo` minutes ago. `people` are its
   * other members with their role and when they last read it.
   */
  const channel = (
    handle: string,
    name: string,
    description: string,
    owner: string,
    createdAgo: number,
    people: [username: string, role: ChannelRole, readAgo: number][],
    lines: Line[]
  ) => {
    const id = channelConversationId(handle);
    conversations.push({
      id,
      kind: "channel",
      createdAt: at(createdAgo),
      channel: { handle, name, description, owner: authorOf(owner) },
    });
    for (const [username, role, readAgo] of [
      [owner, "owner", createdAgo],
      ...people,
    ] as const) {
      members.push({
        conversationId: id,
        user: authorOf(username),
        role,
        joinedAt: at(createdAgo),
        lastReadAt: at(readAgo),
      });
    }
    for (const [messageId, from, minutesAgo, content] of lines) {
      messages.push({
        id: messageId,
        conversationId: id,
        author: authorOf(from),
        createdAt: at(minutesAgo),
        content,
        removed: null,
        requestHash: null,
      });
    }
  };

  channel(
    "superapp_builders",
    "SuperApp builders",
    "Roadmap, feedback and demos from the people building Twitter SuperApp.",
    "superapp",
    5 * DAY,
    [
      // The demo user moderates, and hasn't seen the newest message yet.
      [DEMO_USERNAME, "moderator", 20 * HOUR],
      ["sarahcodes", "member", 2 * HOUR],
      ["devmarco", "member", 22 * HOUR],
      ["ayse_design", "member", 20 * HOUR],
    ],
    [
      [
        "seed-msg-sab-01",
        "superapp",
        5 * DAY - 5,
        text(
          "Welcome, builders 👋 This channel is for the roadmap, feedback and demos."
        ),
      ],
      [
        "seed-msg-sab-02",
        "sarahcodes",
        2 * DAY,
        text("Could the chat composer keep a draft per conversation?"),
      ],
      [
        "seed-msg-sab-03",
        DEMO_USERNAME,
        2 * DAY - 30,
        text("Noted for the roadmap. Stories and rides come first 🚀"),
      ],
      [
        "seed-msg-sab-04",
        "devmarco",
        DAY,
        text(
          "Totally off-topic, but who wants my old mechanical keyboard? Message me ⌨️"
        ),
      ],
      [
        "seed-msg-sab-05",
        "ayse_design",
        20 * HOUR,
        text("The new channel cards are ready for review 🎨"),
      ],
      [
        "seed-msg-sab-06",
        "superapp",
        2 * HOUR,
        text("Channels are live! Anyone can create up to three of their own."),
      ],
    ]
  );

  channel(
    "ankara_eats",
    "Ankara eats",
    "Favourite spots, new menus and late-night food around Ankara.",
    "foodie_ankara",
    6 * DAY,
    [
      ["lahmacunlab", "member", 3 * DAY],
      ["kizilaykahve", "member", 20 * HOUR],
      ["ayse_design", "member", DAY],
    ],
    [
      [
        "seed-msg-ae-01",
        "foodie_ankara",
        6 * DAY - 5,
        text("Welcome! Share your favourite places to eat around the city 🍽️"),
      ],
      [
        "seed-msg-ae-02",
        "lahmacunlab",
        3 * DAY,
        text("Fresh lahmacun out of the oven every ten minutes in Ulus 🔥"),
      ],
      [
        "seed-msg-ae-03",
        "ayse_design",
        DAY,
        text(
          "Where's the best simit near Kızılay? Asking for a design sprint 🥯"
        ),
      ],
      [
        "seed-msg-ae-04",
        "kizilaykahve",
        20 * HOUR,
        text("Ours, obviously 😄 Fresh every morning."),
      ],
    ]
  );

  messages.sort(
    (a, b) =>
      Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
      (a.id < b.id ? -1 : 1)
  );
  return { data: { conversations, members, messages }, contribution: {} };
};
