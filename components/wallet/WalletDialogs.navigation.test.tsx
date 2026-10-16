// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import { openDialog } from "../../slices/uiSlice";
import { AppStore, InitialState, initializeStore } from "../../store";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import {
  held,
  lena,
  limits,
  ok,
  stubApi,
  transfer,
  tweet,
  tweetsState,
  wallet,
  walletState,
} from "./testing";
import WalletDialogs from "./WalletDialogs";

// A tip or top-up confirmed after the reader navigated on (Back, a link):
// the navigation brought page data, so the app renders with a new store
// (initializeStore) that keeps the open dialog. What the server confirmed
// must land in that store, and the sheet must close there, or it stays
// open with a fresh key and a second click pays again.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The app's own Provider, which a navigation hands a new store. */
function App({ store }: { store: AppStore }) {
  return (
    <Provider store={store}>
      <WalletDialogs />
    </Provider>
  );
}

const page = (extra: InitialState = {}): InitialState => ({
  session: sessionState({
    viewer: testViewer,
    readOnly: false,
    features: featuresWith("wallet"),
  }),
  wallet: walletState(),
  ...extra,
});

/** The first page's store, as _app makes it. */
function renderApp(state: InitialState) {
  const store = initializeStore(state);
  const view = renderWithStore(<App store={store} />);
  return {
    store,
    /** Another page arrives with its server data: the app re-renders with a new store. */
    navigate(data: InitialState) {
      const next = initializeStore(data);
      view.rerender(<App store={next} />);
      return next;
    },
  };
}

const TIP_ROUTE = "POST /api/tweets/seed-t03/tip";
const TOP_UP_ROUTE = "POST /api/wallet/top-ups";

describe("a money dialog confirmed after a navigation", () => {
  it("closes the Tip sheet, and the Tweet and toast show on the new page", async () => {
    const tipped = tweet({
      stats: { ...tweet().stats, tips: 3 },
      viewer: { ...tweet().viewer, tipped: true },
    });
    const after = wallet({ balance: 30_660, available: 30_660 });
    const response = held(
      ok(
        {
          transfer: transfer({
            id: "tx-tip",
            kind: "tip",
            amount: 200,
            to: lena,
          }),
          wallet: after,
          tweet: tipped,
        },
        201
      )
    );
    const calls = stubApi({ [TIP_ROUTE]: response.reply });
    const app = renderApp(page({ tweets: tweetsState(tweet()) }));
    const user = userEvent.setup();

    act(() => {
      app.store.dispatch(openDialog("tip", { tweetId: "seed-t03" }));
    });
    await user.click(screen.getByRole("button", { name: "Tip 2.00 credits" }));
    await user.click(
      screen.getByRole("button", { name: "Tip 2.00 credits to Lena Hoffmann" })
    );
    await waitFor(() => expect(calls.to(TIP_ROUTE)).toHaveLength(1));

    // The Tweet's page, read before the tip was committed.
    const next = app.navigate(page({ tweets: tweetsState(tweet()) }));
    expect(next).not.toBe(app.store);
    expect(next.getState().ui.dialog).toBe("tip");
    response.release();

    await waitFor(() => expect(next.getState().ui.dialog).toBeNull());
    expect(
      screen.queryByRole("dialog", { name: "Tip @lenaframes" })
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "Tip 2.00 credits to Lena Hoffmann",
      })
    ).toBeNull();
    expect(calls.to(TIP_ROUTE)).toHaveLength(1);

    const state = next.getState();
    expect(state.tweets.entities["seed-t03"]).toEqual(tipped);
    expect(state.wallet.wallet).toEqual(after);
    expect(state.walletUi.created.map((t) => t.id)).toEqual(["tx-tip"]);
    expect(state.ui.toasts.at(-1)?.message).toBe(
      "You tipped @lenaframes 2.00 credits"
    );
  });

  it("closes Add credits", async () => {
    const after = wallet({ balance: 35_860, available: 35_860 });
    const response = held(
      ok(
        {
          transfer: transfer({
            id: "tx-top",
            kind: "issue",
            from: null,
            to: testViewer,
            amount: 5_000,
          }),
          wallet: after,
        },
        201
      )
    );
    const calls = stubApi({
      [TOP_UP_ROUTE]: response.reply,
      "GET /api/wallet": ok({
        wallet: after,
        limits: limits({ topUpsLeftToday: 1 }),
        serverNow: new Date().toISOString(),
      }),
    });
    const app = renderApp(page());
    const user = userEvent.setup();

    act(() => {
      app.store.dispatch(openDialog("topUp"));
    });
    await user.click(
      screen.getByRole("button", { name: "Add 50.00 demo credits" })
    );
    await waitFor(() => expect(calls.to(TOP_UP_ROUTE)).toHaveLength(1));

    const next = app.navigate(page());
    response.release();

    await waitFor(() => expect(next.getState().ui.dialog).toBeNull());
    expect(screen.queryByRole("dialog", { name: "Add credits" })).toBeNull();
    expect(calls.to(TOP_UP_ROUTE)).toHaveLength(1);
    expect(next.getState().wallet.wallet).toEqual(after);
    expect(next.getState().ui.toasts.at(-1)?.message).toBe(
      "Added 50.00 demo credits"
    );
  });
});
