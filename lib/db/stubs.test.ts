import { describe, expect, it } from "vitest";

import { NotFoundError, NotImplementedError } from "./errors";
import { DEMO_USERNAME } from "./seed";
import {
  unbuiltChannels,
  unbuiltMessages,
  unbuiltOrders,
  unbuiltRides,
  unbuiltShop,
  unbuiltStories,
  unbuiltWallet,
} from "./stubs";

// What a feature serves until its lane replaces the stub: "off", empty
// reads, and NotImplementedError on every write. Tested on the stubs
// themselves, so lanes shipping doesn't change these assertions.

const me = {
  username: DEMO_USERNAME,
  fullname: "Ilhan Ozkan",
  image: "/avatars/illlhanozkan.svg",
};

const stubs = (configured: boolean) => ({
  wallet: unbuiltWallet(configured),
  shop: unbuiltShop(configured),
  orders: unbuiltOrders(configured),
  rides: unbuiltRides(configured),
  stories: unbuiltStories(configured),
  messages: unbuiltMessages(configured),
  channels: unbuiltChannels(configured),
});

describe("feature stubs", () => {
  it("report themselves unbuilt, keeping the store's configuration", async () => {
    for (const configured of [true, false]) {
      for (const [id, stub] of Object.entries(stubs(configured))) {
        expect(stub.implemented, id).toBe(false);
        expect(stub.configured, id).toBe(configured);
        expect(await stub.notifications(DEMO_USERNAME, 10), id).toEqual([]);
        expect(await stub.liveActivity(DEMO_USERNAME), id).toEqual([]);
      }
    }
  });

  it("read as empty", async () => {
    const { shop, orders, rides, stories, messages, channels } = stubs(true);
    expect(await shop.getProductCards(["seed-p-kk-latte"])).toEqual(new Map());
    expect(await shop.getProduct("seed-p-kk-latte")).toBeNull();
    expect(await orders.listOrders({ buyer: DEMO_USERNAME })).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(await rides.getDriver("ahmet_drives")).toBeNull();
    expect(await stories.listTray(DEMO_USERNAME)).toEqual([]);
    expect(await stories.getStory("seed-s1", DEMO_USERNAME)).toBeNull();
    expect(await messages.unreadConversations(DEMO_USERNAME)).toBe(0);
    expect(await channels.listChannels({}, DEMO_USERNAME)).toEqual([]);
    await expect(
      messages.listMessages("dm-a-b", DEMO_USERNAME)
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuse writes with NotImplementedError", async () => {
    const { shop, orders, rides, stories, messages, channels } = stubs(true);
    const key = { operationId: "order-1", fingerprint: "f" };
    const writes = [
      shop.setProductAvailability("seed-p-kk-latte", false),
      orders.placeDemoOrder({
        ...key,
        business: "kizilaykahve",
        requestedBy: me,
      }),
      orders.cancelOrder({ id: "seed-o01", as: "buyer" }),
      rides.cancelRide({ id: "seed-ride01" }),
      stories.markSeen(["seed-s1"], me),
      messages.openDirect(me, { ...me, username: "sarahcodes" }),
      channels.setMembership("ankara_eats", me, true),
    ];
    for (const write of writes) {
      await expect(write).rejects.toBeInstanceOf(NotImplementedError);
    }
  });
});
