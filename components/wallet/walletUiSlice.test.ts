import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import reducer, {
  followsNavigation,
  recentPeople,
  requestChanged,
  requestCreated,
  tipTweet,
  transferCreated,
  walletUiState,
} from "../../slices/walletUiSlice";
import { FOLLOWS_NAVIGATION, makeStore } from "../../store";
import { testViewer } from "../../test/render";
import {
  fail,
  marco,
  paymentRequest,
  sarah,
  stubApi,
  transfer,
  tweet,
  tweetsState,
  wallet,
} from "./testing";

// The wallet lane's slice (slices/walletUiSlice.ts); its tests live with
// the lane's components.

const lena = { username: "lenaframes", fullname: "Lena Hoffmann", image: null };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recentPeople", () => {
  it("lists the other parties of payments, requests and tips, newest first, once", () => {
    const people = recentPeople(
      [
        transfer({ id: "1", to: sarah }),
        transfer({ id: "2", kind: "tip", to: lena }),
        transfer({ id: "3", kind: "request", from: marco, to: testViewer }),
        transfer({ id: "4", to: { ...sarah, username: "SarahCodes" } }),
        transfer({ id: "5", kind: "issue", from: null, to: testViewer }),
        transfer({ id: "6", kind: "order", to: marco }),
      ],
      testViewer.username
    );
    expect(people.map((p) => p.username)).toEqual([
      "sarahcodes",
      "lenaframes",
      "devmarco",
    ]);
  });

  it("stops at the maximum", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      transfer({ id: String(i), to: { ...sarah, username: `user${i}` } })
    );
    expect(recentPeople(many, testViewer.username, 3)).toHaveLength(3);
  });
});

describe("walletUi reducer", () => {
  const initial = reducer(undefined, { type: "init" });

  it("starts empty, and takes the wallet page's requests (or their failure)", () => {
    expect(initial.requests.status).toBe("idle");
    const incoming = [paymentRequest()];
    expect(walletUiState({ incoming, outgoing: [] }).requests).toEqual({
      incoming,
      outgoing: [],
      status: "loaded",
    });
    expect(walletUiState(null).requests.status).toBe("failed");
  });

  it("keeps transfers made here, once, and remembers who was paid", () => {
    const sent = transfer({ id: "tx-1", to: sarah });
    let state = reducer(initial, transferCreated(sent));
    state = reducer(state, transferCreated(sent));
    state = reducer(
      state,
      transferCreated(
        transfer({ id: "tx-2", kind: "issue", from: null, to: testViewer })
      )
    );
    expect(state.created.map((t) => t.id)).toEqual(["tx-2", "tx-1"]);
    // A top-up names nobody to suggest.
    expect(state.recent.people).toEqual([sarah]);
  });

  it("adds a new request to the viewer's own and updates answered ones in place", () => {
    const asked = paymentRequest({
      id: "req-out",
      requester: testViewer,
      payer: marco,
    });
    const owed = paymentRequest({ id: "req-in" });
    let state = walletUiState({ incoming: [owed], outgoing: [] });
    state = reducer(state, requestCreated(asked));
    expect(state.requests.outgoing).toEqual([asked]);
    expect(state.recent.people).toEqual([marco]);

    state = reducer(state, requestChanged({ ...owed, status: "declined" }));
    state = reducer(state, requestChanged({ ...asked, status: "cancelled" }));
    expect(state.requests.incoming[0].status).toBe("declined");
    expect(state.requests.outgoing[0].status).toBe("cancelled");
  });

  it("follows navigations with what the server confirmed", () => {
    for (const type of followsNavigation) {
      expect(FOLLOWS_NAVIGATION.has(type)).toBe(true);
    }
    expect(followsNavigation).toContain(transferCreated.type);
  });

  it("is registered in the store", () => {
    const store = makeStore({
      session: sessionState({ viewer: testViewer, readOnly: false }),
    });
    expect(store.getState().walletUi).toEqual(initial);
  });
});

describe("tipTweet", () => {
  it("replaces the cached Tweet with the server's, and takes its wallet", async () => {
    const before = tweet();
    const after = tweet({
      stats: { ...before.stats, tips: 3 },
      viewer: { ...before.viewer, tipped: true },
    });
    const tip = transfer({ id: "tx-tip", kind: "tip", amount: 200, to: lena });
    const confirmed = wallet({ balance: 30_660, available: 30_660 });
    const calls = stubApi({
      "POST /api/tweets/seed-t03/tip": {
        status: 201,
        body: { transfer: tip, wallet: confirmed, tweet: after },
      },
    });
    const store = makeStore({
      session: sessionState({ viewer: testViewer, readOnly: false }),
      tweets: tweetsState(before),
    });

    const result = await store.dispatch(
      tipTweet("seed-t03", { amount: 200, note: null }, "key-12345678")
    );

    expect(result).toEqual({ transfer: tip, tweet: after });
    expect(calls.calls[0]).toMatchObject({
      body: { amount: 200, note: null },
      key: "key-12345678",
    });
    const state = store.getState();
    expect(state.tweets.entities["seed-t03"]).toEqual(after);
    expect(state.wallet.wallet).toEqual(confirmed);
    expect(state.walletUi.created).toEqual([tip]);
    expect(state.walletUi.recent.people).toEqual([lena]);
  });

  it("changes nothing when the server refuses", async () => {
    stubApi({
      "POST /api/tweets/seed-t03/tip": fail(
        402,
        "insufficient_funds",
        "Not enough credits available"
      ),
    });
    const store = makeStore({
      session: sessionState({ viewer: testViewer, readOnly: false }),
      tweets: tweetsState(tweet()),
    });
    await expect(
      store.dispatch(
        tipTweet("seed-t03", { amount: 200, note: null }, "k1234567")
      )
    ).rejects.toMatchObject({ status: 402, code: "insufficient_funds" });
    expect(store.getState().tweets.entities["seed-t03"]).toEqual(tweet());
    expect(store.getState().walletUi.created).toEqual([]);
  });
});
