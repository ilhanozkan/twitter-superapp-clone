import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import { tweetsReceived } from "../../slices/tweetsSlice";
import reducer, {
  closeRequest,
  fetchRequests,
  findRequest,
  followsNavigation,
  payRequest,
  recentPeople,
  requestChanged,
  requestCreated,
  tipTweet,
  transferCreated,
  tweetTipped,
  walletUiState,
} from "../../slices/walletUiSlice";
import { FOLLOWS_NAVIGATION, makeStore } from "../../store";
import { testViewer } from "../../test/render";
import {
  fail,
  held,
  marco,
  ok,
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
    // A confirmed tip's Tweet follows; late timeline pages must not.
    expect(followsNavigation).toContain(tweetTipped.type);
    expect(FOLLOWS_NAVIGATION.has(tweetsReceived.type)).toBe(false);
  });

  it("keeps a failed read on screen while it is retried", async () => {
    const response = held(ok({ items: [] }));
    stubApi({ "GET /api/wallet/requests": response.reply });
    const store = makeStore({
      session: sessionState({ viewer: testViewer, readOnly: false }),
      walletUi: walletUiState(null),
    });

    const read = store.dispatch(fetchRequests());
    expect(store.getState().walletUi.requests.status).toBe("retrying");
    // One read at a time.
    expect(await store.dispatch(fetchRequests())).toMatchObject({
      meta: { condition: true },
    });
    response.release();
    await read;
    expect(store.getState().walletUi.requests.status).toBe("loaded");
    expect(
      reducer(initial, fetchRequests.pending("", undefined)).requests
    ).toMatchObject({ status: "loading" });
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

describe("answering a request answered elsewhere (409 invalid_state)", () => {
  const owed = paymentRequest({ id: "req-9", requester: marco, amount: 600 });
  const paid = {
    ...owed,
    status: "paid" as const,
    transferId: "tx-lost",
    respondedAt: "2026-10-09T12:00:00.000Z",
  };
  const payment = transfer({
    id: "tx-lost",
    kind: "request",
    to: marco,
    amount: 600,
  });

  function storeWith(
    incoming: (typeof owed)[],
    outgoing: (typeof owed)[] = []
  ) {
    return makeStore({
      session: sessionState({ viewer: testViewer, readOnly: false }),
      walletUi: walletUiState({ incoming, outgoing }),
    });
  }

  it("re-reads it, so its card shows how, and adds the viewer's payment to the activity", async () => {
    const calls = stubApi({
      "POST /api/wallet/requests/req-9/pay": fail(
        409,
        "invalid_state",
        "This request was already paid"
      ),
      "GET /api/wallet/requests/req-9": ok({ request: paid }),
      "GET /api/wallet/transfers/tx-lost": ok({ transfer: payment }),
    });
    const store = storeWith([owed]);

    await expect(
      store.dispatch(payRequest(owed, "key-12345678"))
    ).rejects.toMatchObject({ status: 409, code: "invalid_state" });

    expect(findRequest(store.getState(), "req-9")).toEqual(paid);
    expect(store.getState().walletUi.created).toEqual([payment]);
    expect(calls.calls.map((call) => call.url)).toEqual([
      "/api/wallet/requests/req-9/pay",
      "/api/wallet/requests/req-9",
      "/api/wallet/transfers/tx-lost",
    ]);
  });

  it("re-reads a request the viewer asked for, without taking its payment as theirs", async () => {
    const mine = paymentRequest({
      id: "req-9",
      requester: testViewer,
      payer: marco,
    });
    stubApi({
      "POST /api/wallet/requests/req-9/cancel": fail(
        409,
        "invalid_state",
        "This request was already paid"
      ),
      "GET /api/wallet/requests/req-9": ok({
        request: { ...mine, status: "paid", transferId: "tx-in" },
      }),
    });
    const store = storeWith([], [mine]);

    await expect(
      store.dispatch(closeRequest(mine, "cancel"))
    ).rejects.toMatchObject({ code: "invalid_state" });
    expect(findRequest(store.getState(), "req-9")?.status).toBe("paid");
    expect(store.getState().walletUi.created).toEqual([]);
  });

  it("still fails with the server's error when the re-read fails too", async () => {
    stubApi({
      "POST /api/wallet/requests/req-9/decline": fail(
        409,
        "invalid_state",
        "This request was already paid"
      ),
      "GET /api/wallet/requests/req-9": "network",
    });
    const store = storeWith([owed]);

    await expect(
      store.dispatch(closeRequest(owed, "decline"))
    ).rejects.toMatchObject({ message: "This request was already paid" });
    expect(findRequest(store.getState(), "req-9")).toEqual(owed);
  });
});
