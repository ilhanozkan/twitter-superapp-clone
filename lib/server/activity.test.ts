import { afterEach, describe, expect, it, vi } from "vitest";

import type { Repository } from "../db";
import { INotification } from "../../types/Notification";
import { FeatureId, IFeatures, ILiveActivity } from "../../types/Superapp";
import { loadActivity, MAX_NEW_NOTIFICATIONS } from "./activity";

const actor = { username: "sarahcodes", fullname: "Sarah Chen", image: null };

const notification = (id: string, createdAt: string): INotification => ({
  id,
  type: "like",
  createdAt,
  actor,
  tweet: { id: "seed-t05", text: "Hello" },
  reply: null,
});

const live = (kind: "order" | "ride", id: string): ILiveActivity => ({
  kind,
  id,
  title: kind === "order" ? "Order from Kızılay Kahve" : "Ride to Atakule",
  status: "On the way",
  eta: null,
  href: `/${kind}s/${id}`,
  nextChangeAt: null,
});

function fakeRepo(
  on: FeatureId[],
  overrides: {
    unread?: () => Promise<number>;
    orders?: () => Promise<ILiveActivity[]>;
  } = {}
) {
  const features = Object.fromEntries(
    [
      "wallet",
      "messages",
      "channels",
      "shop",
      "orders",
      "rides",
      "stories",
    ].map((id) => [id, on.includes(id as FeatureId)])
  ) as IFeatures;
  const feature = (activity: ILiveActivity[] = []) => ({
    liveActivity: vi.fn(async () => activity),
  });

  return {
    features,
    listNotifications: vi.fn(async () => [
      notification("n3", "2026-10-09T12:00:00.000Z"),
      notification("n2", "2026-10-09T11:00:00.000Z"),
      notification("n1", "2026-10-09T10:00:00.000Z"),
    ]),
    wallet: feature(),
    messages: {
      ...feature(),
      unreadConversations: vi.fn(overrides.unread ?? (async () => 2)),
    },
    channels: feature(),
    shop: feature(),
    orders: {
      liveActivity: vi.fn(
        overrides.orders ?? (async () => [live("order", "order-1")])
      ),
    },
    rides: feature([live("ride", "ride-1")]),
    stories: feature(),
  } as unknown as Repository & {
    listNotifications: ReturnType<typeof vi.fn>;
    messages: { unreadConversations: ReturnType<typeof vi.fn> };
  };
}

const now = new Date("2026-10-09T12:30:00.000Z");

afterEach(() => vi.restoreAllMocks());

describe("loadActivity", () => {
  it("counts notifications newer than `since`, all of them without it", async () => {
    const repo = fakeRepo([]);

    expect(
      (await loadActivity(repo, "illlhanozkan", { now })).newNotifications
    ).toBe(3);
    expect(
      (
        await loadActivity(repo, "illlhanozkan", {
          since: "2026-10-09T11:00:00.000Z",
          now,
        })
      ).newNotifications
    ).toBe(1);
    expect(repo.listNotifications).toHaveBeenCalledWith(
      "illlhanozkan",
      MAX_NEW_NOTIFICATIONS
    );
  });

  it("reads unread conversations and live activity only from features that are on", async () => {
    const off = fakeRepo(["wallet"]);
    expect(await loadActivity(off, "illlhanozkan", { now })).toEqual({
      serverNow: "2026-10-09T12:30:00.000Z",
      unreadConversations: 0,
      newNotifications: 3,
      live: [],
    });
    expect(off.messages.unreadConversations).not.toHaveBeenCalled();

    const on = fakeRepo(["messages", "orders", "rides"]);
    const activity = await loadActivity(on, "illlhanozkan", { now });
    expect(activity.unreadConversations).toBe(2);
    expect(activity.live.map((item) => item.id)).toEqual(["order-1", "ride-1"]);
  });

  it("degrades a failing feature to nothing instead of failing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const repo = fakeRepo(["messages", "orders", "rides"], {
      unread: async () => {
        throw new Error("messages down");
      },
      orders: async () => {
        throw new Error("orders down");
      },
    });

    const activity = await loadActivity(repo, "illlhanozkan", { now });
    expect(activity.unreadConversations).toBe(0);
    expect(activity.live.map((item) => item.id)).toEqual(["ride-1"]);
    expect(console.error).toHaveBeenCalledTimes(2);
  });
});
