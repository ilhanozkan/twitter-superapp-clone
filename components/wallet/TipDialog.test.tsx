// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IDEMPOTENCY_KEY_PATTERN } from "../../lib/superapp/idempotency";
import { sessionState } from "../../slices/sessionSlice";
import { openDialog } from "../../slices/uiSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { ITweet } from "../../types/Tweet";
import { IWallet } from "../../types/Wallet";
import {
  fail,
  lena,
  ok,
  Reply,
  stubApi,
  transfer,
  tweet,
  tweetsState,
  wallet,
  walletState,
} from "./testing";
import WalletDialogs from "./WalletDialogs";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const TIP_ROUTE = "POST /api/tweets/seed-t03/tip";
const tipped = tweet({
  stats: { ...tweet().stats, tips: 3 },
  viewer: { ...tweet().viewer, tipped: true },
});
const tipTransfer = transfer({
  id: "tx-tip",
  kind: "tip",
  amount: 200,
  to: lena,
  context: { type: "tweet", id: "seed-t03" },
});
const after = wallet({ balance: 30_660, available: 30_660 });

/** `current` is the wallet a re-read finds. */
function api(
  tip: Reply | Reply[] = ok(tipResponse(), 201),
  current: IWallet = wallet({ balance: 150, available: 150 })
) {
  return stubApi({
    "GET /api/wallet": ok({
      wallet: current,
      limits: null,
      serverNow: new Date().toISOString(),
    }),
    [TIP_ROUTE]: tip,
  });
}

function tipResponse(amount = 200) {
  return {
    transfer: { ...tipTransfer, amount },
    wallet: after,
    tweet: tipped,
  };
}

function renderTip(
  value: ITweet | null = tweet(),
  current: IWallet = wallet()
) {
  const view = renderWithStore(<WalletDialogs />, {
    state: {
      session: sessionState({
        viewer: testViewer,
        readOnly: false,
        features: featuresWith("wallet"),
      }),
      wallet: walletState(current),
      tweets: value ? tweetsState(value) : tweetsState(),
    },
  });
  act(() => {
    view.store.dispatch(openDialog("tip", { tweetId: "seed-t03" }));
  });
  return view;
}

const dialog = () => screen.getByRole("dialog", { name: "Tip @lenaframes" });
const confirmButton = (amount = "2.00") =>
  screen.getByRole("button", {
    name: `Tip ${amount} credits to Lena Hoffmann`,
  });

async function toReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Tip 2.00 credits" }));
}

describe("TipDialog", () => {
  it("shows the Tweet with 2.00 chosen, reviews the tip, then sends it", async () => {
    const calls = api();
    const { store } = renderTip();
    const user = userEvent.setup();

    // "Tip @lenaframes" with the Tweet, the amounts, the thanks and what's available.
    expect(dialog().textContent).toContain(
      "Sunrise over the Dolomites this morning."
    );
    const amounts = within(
      screen.getByRole("group", { name: "Amount" })
    ).getAllByRole("radio");
    expect(amounts.map((radio) => radio.getAttribute("value"))).toEqual([
      "100",
      "200",
      "500",
      "1000",
      "other",
    ]);
    const two = screen.getByRole("radio", { name: "2.00 credits" });
    expect(two).toHaveProperty("checked", true);
    expect(document.activeElement).toBe(two);
    expect(dialog().textContent).toContain(
      "From your available 308.60 credits"
    );

    await user.type(
      screen.getByRole("textbox", { name: /Say thanks/ }),
      "Gorgeous 🏔️"
    );
    await toReview(user);

    // The review (WCAG 3.3.4): who, how much, the note and the balance after.
    expect(dialog().textContent).toContain(
      "Tip 2.00 credits to Lena Hoffmann (@lenaframes)"
    );
    expect(within(dialog()).getByText("Gorgeous 🏔️")).toBeTruthy();
    expect(within(dialog()).getByText("306.60 credits")).toBeTruthy();
    expect(document.activeElement).toBe(confirmButton());

    await user.click(confirmButton());
    await waitFor(() => expect(store.getState().ui.dialog).toBeNull());

    const [post] = calls.to(TIP_ROUTE);
    expect(post.body).toEqual({ amount: 200, note: "Gorgeous 🏔️" });
    expect(post.key).toMatch(IDEMPOTENCY_KEY_PATTERN);

    // Every copy of the Tweet updates from the response; the balance is the server's.
    const state = store.getState();
    expect(state.tweets.entities["seed-t03"]).toEqual(tipped);
    expect(state.wallet.wallet).toEqual(after);
    expect(state.walletUi.created.map((t) => t.id)).toEqual(["tx-tip"]);
    expect(state.ui.toasts.at(-1)).toMatchObject({
      message: "You tipped @lenaframes 2.00 credits",
      action: { label: "Receipt", href: "/wallet/transactions/tx-tip" },
    });
  });

  it("takes another amount between 0.50 and 50.00", async () => {
    const calls = api(ok(tipResponse(75), 201));
    renderTip();
    const user = userEvent.setup();

    await user.click(screen.getByRole("radio", { name: "Other amount" }));
    const field = screen.getByRole("textbox", {
      name: "Other amount in credits",
    });
    expect(dialog().textContent).toContain("0.50 credits to 50.00 credits");

    await user.click(screen.getByRole("button", { name: "Tip" }));
    expect(screen.getByRole("alert").textContent).toBe("Enter an amount");
    expect(document.activeElement).toBe(field);

    await user.type(field, "60");
    await user.click(screen.getByRole("button", { name: "Tip" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "The maximum is 50.00 credits"
    );

    await user.clear(field);
    await user.type(field, "0.75");
    await user.click(screen.getByRole("button", { name: "Tip 0.75 credits" }));
    await user.click(confirmButton("0.75"));
    await waitFor(() => expect(calls.to(TIP_ROUTE)).toHaveLength(1));
    expect(calls.to(TIP_ROUTE)[0].body).toEqual({ amount: 75, note: null });
  });

  it("goes Back to the amount, keeping the choice and the thanks", async () => {
    api();
    renderTip();
    const user = userEvent.setup();

    await user.click(screen.getByRole("radio", { name: "5.00 credits" }));
    await user.type(screen.getByRole("textbox", { name: /Say thanks/ }), "Hi");
    await user.click(screen.getByRole("button", { name: "Tip 5.00 credits" }));
    await user.click(screen.getByRole("button", { name: "Back" }));

    const five = screen.getByRole("radio", { name: "5.00 credits" });
    expect(five).toHaveProperty("checked", true);
    expect(document.activeElement).toBe(five);
    expect(screen.getByRole("textbox", { name: /Say thanks/ })).toHaveProperty(
      "value",
      "Hi"
    );
  });

  describe("errors", () => {
    it("explains insufficient funds with an Add credits button", async () => {
      api();
      const { store } = renderTip(
        tweet(),
        wallet({ balance: 150, available: 150 })
      );
      const user = userEvent.setup();

      await toReview(user);
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain(
        "You have 1.50 credits available. Add credits or lower the amount"
      );
      expect(confirmButton().getAttribute("aria-describedby")).toBe(alert.id);
      await user.click(
        within(alert).getByRole("button", { name: "Add credits" })
      );
      expect(store.getState().ui.dialog).toBe("topUp");
    });

    it("re-reads a stale wallet when the server says the funds are short", async () => {
      const calls = api(
        fail(402, "insufficient_funds", "Not enough credits available")
      );
      const { store } = renderTip();
      const user = userEvent.setup();

      await toReview(user);
      await user.click(confirmButton());
      await waitFor(() =>
        expect(store.getState().wallet.wallet?.available).toBe(150)
      );
      expect(calls.to("GET /api/wallet")).toHaveLength(1);
      expect(screen.getByRole("alert").textContent).toContain(
        "You have 1.50 credits available"
      );
    });

    it("says whose wallet is frozen, and asks to slow down when rate limited", async () => {
      api(
        [
          fail(403, "wallet_frozen", "@lenaframes's wallet is frozen"),
          fail(429, "rate_limited", "Too many requests, slow down"),
        ],
        wallet()
      );
      renderTip();
      const user = userEvent.setup();

      await toReview(user);
      await user.click(confirmButton());
      expect((await screen.findByRole("alert")).textContent?.trim()).toBe(
        "A moderator froze @lenaframes’s wallet. Credits can’t move to or from it right now."
      );
      await user.click(confirmButton());
      await waitFor(() =>
        expect(screen.getByRole("alert").textContent?.trim()).toBe(
          "That’s a lot of payments in a minute. Wait a moment, then try again."
        )
      );
      expect(dialog()).toBeTruthy();
    });

    it("says so when the Tweet is gone", async () => {
      api(fail(404, "not_found", "Tweet not found"));
      renderTip();
      const user = userEvent.setup();

      await toReview(user);
      await user.click(confirmButton());
      expect((await screen.findByRole("alert")).textContent?.trim()).toBe(
        "Tweet not found"
      );
    });
  });

  describe("the Idempotency-Key", () => {
    it("is reused by Retry and survives Back, and changes with the amount", async () => {
      const calls = api([
        fail(429, "rate_limited", "Too many requests, slow down"),
        fail(429, "rate_limited", "Too many requests, slow down"),
        fail(429, "rate_limited", "Too many requests, slow down"),
        ok(tipResponse(500), 201),
      ]);
      renderTip();
      const user = userEvent.setup();

      await toReview(user);
      await user.click(confirmButton());
      await screen.findByRole("alert");
      await user.click(confirmButton());
      // Back and forth without changes: still the same operation.
      await user.click(screen.getByRole("button", { name: "Back" }));
      await toReview(user);
      await user.click(confirmButton());
      await waitFor(() => expect(calls.to(TIP_ROUTE)).toHaveLength(3));

      await user.click(screen.getByRole("button", { name: "Back" }));
      await user.click(screen.getByRole("radio", { name: "5.00 credits" }));
      await user.click(
        screen.getByRole("button", { name: "Tip 5.00 credits" })
      );
      await user.click(confirmButton("5.00"));
      await waitFor(() => expect(calls.to(TIP_ROUTE)).toHaveLength(4));

      const keys = calls.to(TIP_ROUTE).map((call) => call.key);
      expect(new Set(keys.slice(0, 3)).size).toBe(1);
      expect(keys[3]).not.toBe(keys[0]);
    });

    it("is new for the next tip after a success", async () => {
      const calls = api();
      const { store } = renderTip();
      const user = userEvent.setup();

      for (let i = 0; i < 2; i++) {
        act(() => {
          store.dispatch(openDialog("tip", { tweetId: "seed-t03" }));
        });
        await toReview(user);
        await user.click(confirmButton());
        await waitFor(() => expect(store.getState().ui.dialog).toBeNull());
      }
      const keys = calls.to(TIP_ROUTE).map((call) => call.key);
      expect(keys).toHaveLength(2);
      expect(keys[0]).not.toBe(keys[1]);
    });
  });

  it("can't tip a Tweet that isn't loaded, or your own", () => {
    api();
    renderTip(null);
    expect(screen.getByRole("dialog", { name: "Tip" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe(
      "This Tweet isn’t available anymore."
    );
    cleanup();

    renderTip(tweet({ author: testViewer }));
    expect(screen.getByRole("alert").textContent).toBe(
      "You can’t tip your own Tweet."
    );
  });
});
