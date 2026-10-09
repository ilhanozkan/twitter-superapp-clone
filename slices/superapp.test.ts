import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FOLLOWS_NAVIGATION,
  initializeStore,
  makeStore,
  mergeServerState,
} from "../store";
import { ActivityResponse } from "../types/Api";
import { ILiveActivity } from "../types/Superapp";
import { IWallet, IWalletLimits } from "../types/Wallet";
import * as activity from "./activitySlice";
import {
  activityState,
  fetchActivity,
  NOTIFICATIONS_SEEN_KEY,
  notificationsSeen,
} from "./activitySlice";
import * as cart from "./cartSlice";
import * as channels from "./channelsSlice";
import * as messages from "./messagesSlice";
import * as orders from "./ordersSlice";
import * as rides from "./ridesSlice";
import { fetchSession, sessionState } from "./sessionSlice";
import * as stories from "./storiesSlice";
import uiReducer, {
  closeCompose,
  closeDialog,
  openCompose,
  openDialog,
} from "./uiSlice";
import * as wallet from "./walletSlice";
import { balanceChanged, fetchWallet } from "./walletSlice";
import * as walletUi from "./walletUiSlice";

const myWallet = (balance: number): IWallet => ({
  username: "illlhanozkan",
  balance,
  pending: 0,
  available: balance,
  frozen: false,
});

const limits: IWalletLimits = {
  minPayment: 50,
  maxPayment: 20_000,
  minTip: 50,
  maxTip: 5_000,
  tipPresets: [100, 200, 500, 1_000],
  topUpAmounts: [2_500, 5_000, 10_000],
  topUpCap: 100_000,
  topUpsPerDay: 3,
  topUpsLeftToday: 3,
  pendingRequestsLeft: 10,
};

const ride = (status: string): ILiveActivity => ({
  kind: "ride",
  id: "r1",
  title: "Ride to Atakule",
  status,
  eta: null,
  href: "/rides/r1",
  nextChangeAt: null,
});

const activityBody = (
  overrides: Partial<ActivityResponse> = {}
): ActivityResponse => ({
  serverNow: "2026-10-09T12:00:00.000Z",
  unreadConversations: 1,
  newNotifications: 4,
  live: [],
  ...overrides,
});

function respondWith(body: unknown) {
  const fetch = vi.fn<(path: string) => Promise<Response>>(
    async () => new Response(JSON.stringify(body))
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

/** A browser-like window with working localStorage. */
function stubStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
    },
  });
  return items;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("wallet slice", () => {
  it("takes the wallet every money response carries", () => {
    const store = makeStore();
    store.dispatch(balanceChanged(myWallet(1_250)));
    expect(store.getState().wallet.wallet?.balance).toBe(1_250);
  });

  it("loads the wallet and limits", async () => {
    const fetch = respondWith({
      wallet: myWallet(32_500),
      limits,
      serverNow: "2026-10-09T12:00:00.000Z",
    });
    const store = makeStore();
    await store.dispatch(fetchWallet());
    expect(fetch).toHaveBeenCalledWith("/api/wallet", expect.anything());
    expect(store.getState().wallet).toEqual({
      wallet: myWallet(32_500),
      limits,
      loaded: true,
    });
  });
});

describe("activity slice", () => {
  it("sends this device's notificationsSeenAt as since", async () => {
    stubStorage({ [NOTIFICATIONS_SEEN_KEY]: "2026-10-09T11:00:00.000Z" });
    const fetch = respondWith(activityBody());
    const store = makeStore();
    await store.dispatch(fetchActivity());

    expect(fetch.mock.calls[0][0]).toBe(
      "/api/activity?since=2026-10-09T11%3A00%3A00.000Z"
    );
    expect(store.getState().activity).toMatchObject({
      unreadConversations: 1,
      newNotifications: 4,
      loaded: true,
    });
  });

  it("asks without since when Notifications was never opened here", async () => {
    stubStorage();
    const fetch = respondWith(activityBody());
    await makeStore().dispatch(fetchActivity());
    expect(fetch.mock.calls[0][0]).toBe("/api/activity");
  });

  it("clears the bell and remembers when Notifications was seen", () => {
    const storage = stubStorage();
    const store = makeStore({
      activity: { ...activity.initialActivityState, newNotifications: 5 },
    });
    store.dispatch(notificationsSeen("2026-10-09T12:00:00.000Z"));
    expect(store.getState().activity.newNotifications).toBe(0);
    expect(storage.get(NOTIFICATIONS_SEEN_KEY)).toBe(
      "2026-10-09T12:00:00.000Z"
    );
  });

  it("ignores the count of a poll sent before Notifications was seen", () => {
    const store = makeStore();
    store.dispatch(notificationsSeen("2026-10-09T12:00:00.000Z"));
    store.dispatch({
      type: fetchActivity.fulfilled.type,
      payload: { ...activityBody({ newNotifications: 7 }), since: null },
    });
    expect(store.getState().activity.newNotifications).toBe(0);
    expect(store.getState().activity.unreadConversations).toBe(1);

    store.dispatch({
      type: fetchActivity.fulfilled.type,
      payload: {
        ...activityBody({ newNotifications: 2 }),
        since: "2026-10-09T12:00:00.000Z",
      },
    });
    expect(store.getState().activity.newNotifications).toBe(2);
  });

  it("announces status changes only", () => {
    const store = makeStore();
    const poll = (live: ILiveActivity[]) =>
      store.dispatch({
        type: fetchActivity.fulfilled.type,
        payload: { ...activityBody({ live }), since: null },
      });

    poll([ride("Finding your driver")]);
    expect(store.getState().activity.announcement).toBe("");
    poll([ride("Finding your driver")]);
    expect(store.getState().activity.announcement).toBe("");
    poll([ride("Ahmet is 3 min away")]);
    expect(store.getState().activity.announcement).toBe(
      "Ride to Atakule: Ahmet is 3 min away"
    );
  });

  it("server-rendered activity waits for the client's own count", () => {
    expect(activityState(activityBody())).toMatchObject({
      newNotifications: 4,
      loaded: false,
    });
  });

  it("keeps the client's bell count when a page brings server data", () => {
    const current = makeStore({
      activity: {
        ...activity.initialActivityState,
        newNotifications: 1,
        loaded: true,
        seenAt: "2026-10-09T11:00:00.000Z",
      },
    }).getState();
    const merged = mergeServerState(
      current,
      { activity: activityState(activityBody({ unreadConversations: 3 })) },
      false
    );
    expect(merged.activity).toMatchObject({
      newNotifications: 1,
      unreadConversations: 3,
      seenAt: "2026-10-09T11:00:00.000Z",
      loaded: true,
    });
  });
});

describe("session slice", () => {
  it("defaults to no features and no businesses", () => {
    expect(sessionState({ viewer: null, readOnly: false })).toMatchObject({
      features: { wallet: false, messages: false, shop: false },
      managedBusinesses: [],
    });
  });

  it("loads features and managed businesses from /api/me", async () => {
    respondWith({
      user: { username: "illlhanozkan", fullname: "Ilhan Ozkan", image: null },
      readOnly: false,
      features: {
        ...sessionState({ viewer: null, readOnly: false }).features,
        wallet: true,
      },
      managedBusinesses: ["superapp"],
    });
    const store = makeStore();
    await store.dispatch(fetchSession());
    expect(store.getState().session).toMatchObject({
      viewer: { username: "illlhanozkan" },
      features: { wallet: true, shop: false },
      managedBusinesses: ["superapp"],
    });
  });
});

describe("ui slice", () => {
  const initial = uiReducer(undefined, { type: "init" });

  it("opens a dialog by name, as before", () => {
    const state = uiReducer(initial, openDialog("display"));
    expect(state.dialog).toBe("display");
    expect(state.dialogArgs).toBeNull();
  });

  it("passes arguments to a dialog and clears them on close", () => {
    let state = uiReducer(initial, openDialog("send", { to: "sarahcodes" }));
    expect(state).toMatchObject({
      dialog: "send",
      dialogArgs: { to: "sarahcodes" },
    });
    state = uiReducer(state, closeDialog());
    expect(state).toMatchObject({ dialog: null, dialogArgs: null });
  });

  it("opens an empty composer without a payload, as before", () => {
    expect(uiReducer(initial, openCompose())).toMatchObject({
      composeOpen: true,
      composePrefill: null,
    });
    expect(uiReducer(initial, { type: "ui/openCompose" })).toMatchObject({
      composeOpen: true,
      composePrefill: null,
    });
  });

  it("opens the composer prefilled and forgets it on close", () => {
    const prefill = {
      text: "Just had the Pistachio latte",
      attachment: { type: "product" as const, productId: "seed-p-kk-latte" },
    };
    let state = uiReducer(initial, openCompose(prefill));
    expect(state.composePrefill).toEqual(prefill);
    state = uiReducer(state, closeCompose());
    expect(state).toMatchObject({ composeOpen: false, composePrefill: null });
  });
});

describe("followsNavigation", () => {
  it("includes every SuperApp slice's list", () => {
    const lists = [
      wallet.followsNavigation,
      activity.followsNavigation,
      walletUi.followsNavigation,
      messages.followsNavigation,
      channels.followsNavigation,
      cart.followsNavigation,
      orders.followsNavigation,
      rides.followsNavigation,
      stories.followsNavigation,
    ];
    for (const type of lists.flat()) {
      expect(FOLLOWS_NAVIGATION.has(type)).toBe(true);
    }
    expect(FOLLOWS_NAVIGATION.has(balanceChanged.type)).toBe(true);
  });

  it("a balance confirmed after a navigation reaches the current page", () => {
    vi.stubGlobal("window", {});
    const before = initializeStore({
      session: sessionState({ viewer: null, readOnly: false }),
    });
    const after = initializeStore({
      session: sessionState({ viewer: null, readOnly: false }),
    });

    before.dispatch(balanceChanged(myWallet(900)));
    expect(after.getState().wallet.wallet?.balance).toBe(900);
  });

  it("registers every lane slice in the store", () => {
    const state = makeStore().getState();
    for (const key of [
      "wallet",
      "activity",
      "walletUi",
      "messages",
      "channels",
      "cart",
      "orders",
      "rides",
      "stories",
    ]) {
      expect(state).toHaveProperty(key);
    }
  });
});
