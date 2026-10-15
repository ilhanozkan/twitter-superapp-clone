import { describe, expect, it } from "vitest";

import {
  expectLedgerInvariants,
  expectStoresAgree,
  SUBJECT_NOW,
  subjects,
} from "../../test/repositorySubjects";
import { INotification } from "../../types/Notification";
import { IAuthor } from "../../types/User";
import { MessageRecord } from "./messages/records";
import { keyOf, PRIVATE_TYPES } from "./sanity/ids";
import { seedExportDocuments, seedToSanityDocuments } from "./sanity/seed";
import { createSeedData, DEMO_USERNAME, seedContext } from "./seed";
import { createWalletSeed } from "./seeds/wallet";
import { Repository } from "./types";

// The whole SuperApp world (§14.4): every lane's seed composed into the one
// world the app's memory store serves (getMemoryState) and `npm run
// seed:sanity` exports. Lane tests check their own part; this checks that
// the parts fit together.

const NOW = SUBJECT_NOW;
const world = createSeedData(NOW);
const superapp = world.superapp!;
const wallet = superapp.wallet;
const shop = superapp.shop!;
const orders = superapp.orders!.orders;
const rides = superapp.rides!;
const stories = superapp.stories!;
const messages = superapp.messages!;

const lower = (username: string) => username.toLowerCase();
const same = (a: string, b: string) => lower(a) === lower(b);
const byId = <T extends { id: string }>(items: T[]) =>
  new Map(items.map((item) => [item.id, item]));

const users = new Map(world.users.map((user) => [lower(user.username), user]));
const tweets = byId(world.tweets);
const transfers = byId(wallet.transfers);
const requests = byId(wallet.requests);
const products = byId(shop.products);
const ordersById = byId(orders);
const ridesById = byId(rides.rides);
const storiesById = byId(stories.stories);
const conversations = byId(messages.conversations);

/** Accounts the lanes' seeds notify of money, orders and rides. */
const NOTIFIED = [
  DEMO_USERNAME,
  "sarahcodes",
  "ayse_design",
  "lenaframes",
  "superapp",
  "kizilaykahve",
];

const members = (conversationId: string) =>
  messages.members
    .filter((member) => member.conversationId === conversationId)
    .map((member) => lower(member.user.username));

/** The snapshot a record keeps of a person, as the user record has it now. */
const snapshotOf = (username: string): IAuthor => {
  const user = users.get(lower(username));
  return user
    ? { username: user.username, fullname: user.fullname, image: user.image }
    : { username: `unknown user @${username}`, fullname: "", image: null };
};
const asAuthor = ({ username, fullname, image }: IAuthor): IAuthor => ({
  username,
  fullname,
  image,
});

describe("the demo user's money", () => {
  it("ends at 308.60 credits: 325.00 from F's seed, less seed-o01 (9.00) and seed-ride01 (7.40)", () => {
    // F's own transfers leave the demo user at 325.00 (lib/db/seed.test.ts);
    // the lanes' only other movements of the demo user's credits are the
    // Kızılay Kahve order and the ride to Atakule.
    const fromF = new Set(
      createWalletSeed(seedContext(NOW)).contribution.transfers!.map(
        (transfer) => transfer.id
      )
    );
    const laneMovements = wallet.transfers
      .filter((transfer) => !fromF.has(transfer.id))
      .flatMap((transfer) =>
        transfer.from && same(transfer.from.username, DEMO_USERNAME)
          ? [[transfer.id, -transfer.amount]]
          : same(transfer.to.username, DEMO_USERNAME)
            ? [[transfer.id, transfer.amount]]
            : []
      );

    expect(laneMovements).toEqual([
      ["seed-tx-ride01", -740],
      ["seed-tx-o01", -900],
    ]);
    expect(wallet.balances[DEMO_USERNAME]).toBe(32_500 - 900 - 740);
  });

  describe.each(subjects())("%s store", (_name, create) => {
    it("serves 308.60 credits, all of them available", async () => {
      const { repo } = create();
      expect(await repo.wallet.getWallet(DEMO_USERNAME)).toEqual({
        username: DEMO_USERNAME,
        balance: 30_860,
        pending: 0,
        available: 30_860,
        frozen: false,
      });
    });

    it("keeps the ledger invariants, with every credit issued accounted for", async () => {
      const subject = create();
      await expectLedgerInvariants(subject);
      const issued = wallet.transfers
        .filter((transfer) => transfer.from === null)
        .reduce((sum, transfer) => sum + transfer.amount, 0);
      expect(await subject.repo.wallet.audit()).toMatchObject({
        ok: true,
        transfers: wallet.transfers.length,
        issued,
        totalBalance: issued,
        mismatches: [],
        negative: [],
        pendingOverBalance: [],
        badReversals: [],
      });
    });
  });
});

describe("cross-references", () => {
  it("attaches products that exist to their own business's Tweets", () => {
    const attached = world.tweets.filter((tweet) => tweet.attachment);
    expect(attached.length).toBeGreaterThan(0);
    for (const tweet of attached) {
      const product = products.get(tweet.attachment!.productId);
      expect(product, tweet.id).toBeDefined();
      expect(lower(product!.business), tweet.id).toBe(lower(tweet.author));
    }
  });

  it("gives every transfer a context that exists and matches it", () => {
    for (const transfer of wallet.transfers) {
      const { context } = transfer;
      if (!context) {
        // Only demo credits SuperApp issues are for nothing in particular.
        expect(transfer.kind, transfer.id).toBe("issue");
        continue;
      }
      switch (context.type) {
        case "tweet": {
          const tweet = tweets.get(context.id);
          expect(tweet, transfer.id).toBeDefined();
          expect(lower(transfer.to.username), transfer.id).toBe(
            lower(tweet!.author)
          );
          break;
        }
        case "conversation": {
          const conversation = conversations.get(context.id);
          expect(conversation?.kind, transfer.id).toBe("direct");
          expect(members(context.id).sort(), transfer.id).toEqual(
            [transfer.from!.username, transfer.to.username].map(lower).sort()
          );
          break;
        }
        case "request": {
          const request = requests.get(context.id);
          expect(request, transfer.id).toMatchObject({
            transferId: transfer.id,
            payer: transfer.from,
            requester: transfer.to,
            amount: transfer.amount,
          });
          break;
        }
        case "order": {
          const order = ordersById.get(context.id);
          expect(order?.code, transfer.id).toBe(context.code);
          break;
        }
        case "ride": {
          const ride = ridesById.get(context.id);
          expect(ride?.code, transfer.id).toBe(context.code);
          break;
        }
      }
    }
  });

  it("names refunds and reversals that exist", () => {
    for (const transfer of wallet.transfers) {
      if (transfer.reversedBy) {
        expect(transfers.get(transfer.reversedBy)?.reverses).toBe(transfer.id);
      }
      if (transfer.reverses) {
        expect(transfers.get(transfer.reverses)?.reversedBy).toBe(transfer.id);
      }
    }
  });

  it("puts every request made in a conversation into it, with its bubble", () => {
    const inConversations = wallet.requests.filter(
      (request) => request.conversationId
    );
    expect(inConversations.length).toBeGreaterThan(0);
    for (const request of inConversations) {
      const id = request.conversationId!;
      expect(conversations.get(id)?.kind, request.id).toBe("direct");
      expect(members(id).sort(), request.id).toEqual(
        [request.requester.username, request.payer.username].map(lower).sort()
      );
      expect(
        messages.messages.filter(
          (message) =>
            message.conversationId === id &&
            message.content.type === "request" &&
            message.content.requestId === request.id
        ),
        request.id
      ).toHaveLength(1);
    }
    for (const request of wallet.requests) {
      if (request.transferId) {
        expect(transfers.get(request.transferId)?.context).toEqual({
          type: "request",
          id: request.id,
        });
      }
    }
  });

  it("points chat bubbles at the payments, requests, Tweets and stories they show", () => {
    const check = (message: MessageRecord) => {
      const { content } = message;
      const others = members(message.conversationId).filter(
        (username) => username !== lower(message.author.username)
      );
      switch (content.type) {
        case "payment": {
          const transfer = transfers.get(content.transferId);
          expect(transfer, message.id).toMatchObject({
            kind: "payment",
            amount: content.amount,
            note: content.note,
            from: message.author,
            context: { type: "conversation", id: message.conversationId },
          });
          expect(others, message.id).toEqual([lower(transfer!.to.username)]);
          break;
        }
        case "request": {
          const request = requests.get(content.requestId);
          expect(request, message.id).toMatchObject({
            requester: message.author,
            conversationId: message.conversationId,
          });
          expect(others, message.id).toEqual([lower(request!.payer.username)]);
          break;
        }
        case "text":
          if (content.tweetId) {
            expect(tweets.has(content.tweetId), message.id).toBe(true);
          }
          if (content.storyId) {
            const story = storiesById.get(content.storyId);
            expect(story, message.id).toBeDefined();
            expect(content.storyAuthor, message.id).toEqual(story!.author);
          }
          break;
      }
    };
    expect(
      messages.messages.some((message) => message.content.type === "payment")
    ).toBe(true);
    expect(
      messages.messages.some((message) => message.content.type === "request")
    ).toBe(true);
    messages.messages.forEach(check);
  });

  it("writes every message in a conversation its author is in", () => {
    for (const member of messages.members) {
      expect(conversations.has(member.conversationId)).toBe(true);
    }
    for (const message of messages.messages) {
      expect(conversations.has(message.conversationId), message.id).toBe(true);
      expect(members(message.conversationId), message.id).toContain(
        lower(message.author.username)
      );
    }
  });

  it("pays for every order and ride with its own held transfer", () => {
    for (const order of orders) {
      expect(transfers.get(order.paymentTransferId), order.id).toMatchObject({
        kind: "order",
        amount: order.total,
        from: order.buyer,
        to: asAuthor(order.business),
        context: { type: "order", id: order.id, code: order.code },
        holdUntil: order.deliverAt,
      });
      if (order.refundTransferId) {
        expect(transfers.get(order.refundTransferId)?.reverses).toBe(
          order.paymentTransferId
        );
      }
      for (const line of order.lines) {
        const product = products.get(line.productId);
        expect(product, `${order.id} ${line.productId}`).toMatchObject({
          name: line.name,
          price: line.unitPrice,
        });
        expect(same(product!.business, order.business.username)).toBe(true);
      }
    }
    for (const ride of rides.rides) {
      expect(transfers.get(ride.paymentTransferId), ride.id).toMatchObject({
        kind: "ride",
        amount: ride.fare,
        from: ride.rider,
        to: asAuthor(ride.driver),
        context: { type: "ride", id: ride.id, code: ride.code },
        holdUntil: ride.pickupAt,
      });
      if (ride.refundTransferId) {
        expect(transfers.get(ride.refundTransferId)?.reverses).toBe(
          ride.paymentTransferId
        );
      }
      const profile = rides.drivers.find((driver) =>
        same(driver.username, ride.driver.username)
      );
      expect(profile?.vehicle, ride.id).toEqual(ride.driver.vehicle);
    }
  });

  it("records views and replies of stories that exist", () => {
    for (const view of stories.views) {
      expect(storiesById.has(view.storyId), view.storyId).toBe(true);
    }
    // Story replies are text messages naming the story (none are seeded
    // yet; the bubble check above covers any that are).
    for (const message of messages.messages) {
      if (message.content.type === "text" && message.content.storyId) {
        expect(storiesById.has(message.content.storyId)).toBe(true);
      }
    }
  });

  it("snapshots every person as their user record has them", () => {
    const parties: [string, IAuthor][] = [
      ...wallet.transfers.flatMap((t): [string, IAuthor][] => [
        ...(t.from ? [[t.id, t.from] as [string, IAuthor]] : []),
        [t.id, t.to],
      ]),
      ...wallet.requests.flatMap((r): [string, IAuthor][] => [
        [r.id, r.requester],
        [r.id, r.payer],
      ]),
      ...orders.flatMap((o): [string, IAuthor][] => [
        [o.id, o.buyer],
        [o.id, asAuthor(o.business)],
      ]),
      ...rides.rides.flatMap((r): [string, IAuthor][] => [
        [r.id, r.rider],
        [r.id, asAuthor(r.driver)],
      ]),
      ...stories.stories.map((s): [string, IAuthor] => [s.id, s.author]),
      ...stories.views.map((v): [string, IAuthor] => [v.storyId, v.viewer]),
      ...messages.members.map((m): [string, IAuthor] => [
        m.conversationId,
        m.user,
      ]),
      ...messages.messages.map((m): [string, IAuthor] => [m.id, m.author]),
      ...messages.conversations.flatMap((c): [string, IAuthor][] =>
        c.channel ? [[c.id, c.channel.owner]] : []
      ),
    ];
    for (const [record, party] of parties) {
      expect(party, record).toEqual(snapshotOf(party.username));
    }
    for (const tweet of world.tweets) {
      expect(users.has(lower(tweet.author)), tweet.id).toBe(true);
    }
    for (const profile of [...superapp.business.profiles, ...rides.drivers]) {
      expect(users.has(lower(profile.username)), profile.username).toBe(true);
    }
    for (const product of shop.products) {
      expect(users.get(lower(product.business))?.accountType).toBe("business");
    }
  });

  describe.each(subjects())("notifications (%s store)", (name, create) => {
    // The fake Sanity client takes most of a second per account to derive
    // notifications, so it reads the demo user's, who gets every kind; the
    // agreement test below compares the other notified accounts' with
    // memory, which reads everyone's here.
    const accounts =
      name === "memory"
        ? world.users.map((user) => user.username)
        : [DEMO_USERNAME];

    /** What a notification links to, read the way its page reads it. */
    async function targets(
      repo: Repository,
      viewer: string,
      notification: INotification
    ): Promise<Record<string, unknown>> {
      const conversation = (
        id: string | null
      ): Record<string, Promise<unknown>> =>
        id ? { conversation: repo.messages.getConversation(id, viewer) } : {};
      const reads = ((): Record<string, Promise<unknown>> => {
        switch (notification.type) {
          case "like":
          case "retweet":
            return { tweet: repo.getTweet(notification.tweet.id) };
          case "reply":
            return {
              tweet: repo.getTweet(notification.tweet.id),
              reply: repo
                .listReplies(notification.tweet.id)
                .then((replies) =>
                  replies.find((reply) => reply.id === notification.reply.id)
                ),
            };
          case "tip":
            return {
              ...(notification.tweet && {
                tweet: repo.getTweet(notification.tweet.id),
              }),
              transfer: repo.wallet.getTransfer(notification.transferId),
            };
          case "payment":
            return {
              transfer: repo.wallet.getTransfer(notification.transferId),
              ...conversation(notification.conversationId),
            };
          case "payment_request":
            return {
              request: repo.wallet.getRequest(notification.requestId),
              ...conversation(notification.conversationId),
            };
          case "request_paid":
          case "request_declined":
            return {
              request: repo.wallet.getRequest(notification.requestId),
              ...(notification.transferId && {
                transfer: repo.wallet.getTransfer(notification.transferId),
              }),
            };
          case "order":
            return { order: repo.orders.getOrder(notification.orderId) };
          case "ride":
            return { ride: repo.rides.getRide(notification.rideId) };
        }
      })();
      return Object.fromEntries(
        await Promise.all(
          Object.entries(reads).map(async ([key, read]) => [key, await read])
        )
      );
    }

    it("link to records that exist", async () => {
      const { repo } = create();
      const types = new Set<string>();
      for (const username of accounts) {
        for (const notification of await repo.listNotifications(
          username,
          100
        )) {
          types.add(notification.type);
          const found = await targets(repo, username, notification);
          const missing = Object.keys(found).filter((key) => !found[key]);
          expect(missing, `${username}: ${notification.id}`).toEqual([]);
        }
      }
      // Every kind of notification the seeds can produce was checked.
      expect([...types].sort()).toEqual([
        "like",
        "order",
        "payment",
        "payment_request",
        "reply",
        "request_paid",
        "retweet",
        "ride",
        "tip",
      ]);
    });

    it("tell the demo user what the first run promises (§4.2)", async () => {
      const { repo } = create();
      const said = (await repo.listNotifications(DEMO_USERNAME, 100)).map(
        (notification) =>
          `${notification.type}${"event" in notification ? ` ${notification.event}` : ""} by ${notification.actor.username}`
      );
      expect(said).toEqual(
        expect.arrayContaining([
          "tip by sarahcodes",
          "payment by devmarco",
          "request_paid by ayse_design",
          "order delivered by kizilaykahve",
          "ride completed by ahmet_drives",
          "order received by devmarco",
        ])
      );
    });
  });
});

describe("ids", () => {
  it("are unique across every kind of record in the world", () => {
    const ids = [
      ...world.tweets,
      ...world.replies,
      ...wallet.transfers,
      ...wallet.requests,
      ...shop.products,
      ...orders,
      ...rides.rides,
      ...stories.stories,
      ...messages.conversations,
      ...messages.messages,
    ].map((record) => record.id);
    const repeated = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(repeated).toEqual([]);
  });
});

describe("the Sanity export", () => {
  const documents = seedExportDocuments(NOW);

  it("is the world the memory store serves, as documents", () => {
    // getMemoryState seeds createSeedData(now, { world: "superapp" }), and
    // the contract harness's Sanity subject imports exactly these documents.
    expect(documents).toEqual(
      seedToSanityDocuments(createSeedData(NOW, { world: "superapp" }))
    );
  });

  it("stores private types under private ids, and only them", () => {
    const privateTypes: readonly string[] = PRIVATE_TYPES;
    for (const document of documents) {
      expect(document._id.startsWith("private."), document._id).toBe(
        privateTypes.includes(document._type)
      );
    }
    // Every private type is exported, so none escapes the check above.
    expect(
      [
        ...new Set(
          documents
            .filter((document) => document._id.startsWith("private."))
            .map((document) => document._type)
        ),
      ].sort()
    ).toEqual([...PRIVATE_TYPES].sort());
  });

  it("gives every document its own key, private or not", () => {
    const keys = documents.map((document) => keyOf(document._id));
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual(
      []
    );
  });

  it("serves the same world from Sanity as from memory", async () => {
    // Reads every lane's records for every account, so a record the export
    // left out (or wrote differently) shows up as a difference. Notifications
    // and channel lists are slow on the fake client: they are read for the
    // accounts the seeds notify, and for the demo user.
    const settle = async <T>(read: Promise<T>) => {
      try {
        return await read;
      } catch (error) {
        return { error: (error as Error).name };
      }
    };
    await expectStoresAgree(async (repo) => {
      const accounts = [];
      for (const { username } of world.users) {
        accounts.push({
          username,
          wallet: await settle(repo.wallet.getWallet(username)),
          activity: await settle(
            repo.wallet.listActivity(username, { limit: 100 })
          ),
          incoming: await settle(
            repo.wallet.listRequests(username, { role: "incoming" })
          ),
          outgoing: await settle(
            repo.wallet.listRequests(username, { role: "outgoing" })
          ),
          conversations: await settle(
            repo.messages.listConversations(username)
          ),
          orders: await settle(
            repo.orders.listOrders({ buyer: username, limit: 50 })
          ),
          sales: await settle(
            repo.orders.listOrders({ business: username, limit: 50 })
          ),
          rides: await settle(
            repo.rides.listRides({ rider: username, limit: 50 })
          ),
          drives: await settle(
            repo.rides.listRides({ driver: username, limit: 50 })
          ),
          tray: await settle(repo.stories.listTray(username)),
          live: [
            await settle(repo.orders.liveActivity(username)),
            await settle(repo.rides.liveActivity(username)),
          ],
          managed: await settle(repo.business.listManagedBusinesses(username)),
          notifications: NOTIFIED.includes(username)
            ? await settle(repo.listNotifications(username, 100))
            : null,
        });
      }
      const menus = [];
      for (const { username } of superapp.business.profiles) {
        menus.push(await settle(repo.shop.getMenu(username)));
      }
      return {
        accounts,
        menus,
        businesses: await repo.business.listBusinesses(),
        timeline: await repo.listTweets({ viewer: DEMO_USERNAME, limit: 100 }),
        channels: await repo.channels.listChannels({}, DEMO_USERNAME),
        demoChannels: await repo.channels.listChannels(
          { member: DEMO_USERNAME },
          DEMO_USERNAME
        ),
        audit: await repo.wallet.audit(),
      };
    });
  }, 60_000);
});
