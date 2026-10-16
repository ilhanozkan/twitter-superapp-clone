import {
  directConversationId,
  greetingMessageId,
} from "../../superapp/messages";
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

  messages.sort(
    (a, b) =>
      Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
      (a.id < b.id ? -1 : 1)
  );
  return { data: { conversations, members, messages }, contribution: {} };
};
