import { describe, expect, it, vi } from "vitest";

import { INotification } from "../../types/Notification";
import { IFeatures } from "../../types/Superapp";
import { mergeNotifications } from "./notifications";
import {
  unbuiltBusiness,
  unbuiltChannels,
  unbuiltMessages,
  unbuiltOrders,
  unbuiltRides,
  unbuiltShop,
  unbuiltStories,
  unbuiltWallet,
} from "./stubs";

const actor = { username: "sarahcodes", fullname: "Sarah Chen", image: null };
const at = (minutes: number) =>
  new Date(Date.UTC(2026, 9, 8, 12, minutes)).toISOString();

const like = (id: string, minutes: number): INotification => ({
  id,
  type: "like",
  createdAt: at(minutes),
  actor,
  tweet: { id: "seed-t05", text: "..." },
  reply: null,
});
const tip = (id: string, minutes: number): INotification => ({
  id,
  type: "tip",
  createdAt: at(minutes),
  actor,
  tweet: null,
  amount: 200,
  transferId: id,
});

const off: IFeatures = {
  wallet: false,
  messages: false,
  channels: false,
  shop: false,
  orders: false,
  rides: false,
  stories: false,
};

function subs(walletNotifications: INotification[]) {
  const wallet = {
    ...unbuiltWallet(true),
    notifications: vi.fn(async () => walletNotifications),
  };
  const orders = {
    ...unbuiltOrders(true),
    notifications: vi.fn(async () => []),
  };
  return {
    wallet,
    business: unbuiltBusiness(),
    shop: unbuiltShop(true),
    orders,
    rides: unbuiltRides(true),
    stories: unbuiltStories(true),
    messages: unbuiltMessages(true),
    channels: unbuiltChannels(true),
  };
}

describe("mergeNotifications", () => {
  it("merges core and every on feature's notifications, newest first", async () => {
    const repos = subs([tip("tip-1", 30), tip("tip-2", 5)]);
    const merged = await mergeNotifications(
      async () => [like("like-1", 20), like("like-2", 1)],
      repos,
      { ...off, wallet: true },
      "illlhanozkan",
      10
    );

    expect(merged.map((n) => n.id)).toEqual([
      "tip-1",
      "like-1",
      "tip-2",
      "like-2",
    ]);
    expect(repos.wallet.notifications).toHaveBeenCalledWith("illlhanozkan", 10);
    expect(repos.orders.notifications).not.toHaveBeenCalled();
  });

  it("asks every source for at most the limit and applies it to the result", async () => {
    const repos = subs([tip("tip-1", 30), tip("tip-2", 5)]);
    const core = vi.fn(async () => [like("like-1", 20)]);

    const merged = await mergeNotifications(
      core,
      repos,
      { ...off, wallet: true },
      "illlhanozkan",
      2.7
    );

    expect(core).toHaveBeenCalledWith(2);
    expect(merged.map((n) => n.id)).toEqual(["tip-1", "like-1"]);
  });

  it("ignores features that are off", async () => {
    const repos = subs([tip("tip-1", 30)]);
    const merged = await mergeNotifications(
      async () => [like("like-1", 20)],
      repos,
      off,
      "illlhanozkan"
    );
    expect(merged.map((n) => n.id)).toEqual(["like-1"]);
    expect(repos.wallet.notifications).not.toHaveBeenCalled();
  });
});
