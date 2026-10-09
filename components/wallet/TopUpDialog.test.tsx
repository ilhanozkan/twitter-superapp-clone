// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import { openDialog } from "../../slices/uiSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { IWallet, IWalletLimits } from "../../types/Wallet";
import {
  fail,
  limits,
  ok,
  Reply,
  stubApi,
  transfer,
  wallet,
  walletState,
} from "./testing";
import { topUpOptions } from "./TopUpDialog";
import WalletDialogs from "./WalletDialogs";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const added = transfer({
  id: "tx-top",
  kind: "issue",
  from: null,
  to: testViewer,
  amount: 5_000,
});
const after = wallet({ balance: 35_860, available: 35_860 });

function api(
  topUp: Reply | Reply[] = ok({ transfer: added, wallet: after }, 201)
) {
  return stubApi({
    "GET /api/wallet": ok({
      wallet: after,
      limits: limits({ topUpsLeftToday: 1 }),
      serverNow: new Date().toISOString(),
    }),
    "POST /api/wallet/top-ups": topUp,
  });
}

function renderTopUp(
  value: IWallet = wallet(),
  limitsValue: IWalletLimits | null = limits()
) {
  const view = renderWithStore(<WalletDialogs />, {
    state: {
      session: sessionState({
        viewer: testViewer,
        readOnly: false,
        features: featuresWith("wallet"),
      }),
      wallet: walletState(value, limitsValue),
    },
  });
  act(() => {
    view.store.dispatch(openDialog("topUp"));
  });
  return view;
}

const dialog = () => screen.getByRole("dialog", { name: "Add credits" });
const amounts = () => within(dialog()).getAllByRole("radio");

describe("TopUpDialog", () => {
  it("adds 50.00 by default, then closes with a toast linking the receipt", async () => {
    const calls = api();
    const { store } = renderTopUp();
    const user = userEvent.setup();

    expect(
      within(dialog()).getByText(
        "Demo credits are free and have no cash value."
      )
    ).toBeTruthy();
    expect(
      screen.getByRole("radio", { name: "50.00" }) as HTMLInputElement
    ).toHaveProperty("checked", true);
    expect(dialog().textContent).toContain("2 of 3 per 24 hours");

    await user.click(
      screen.getByRole("button", { name: "Add 50.00 demo credits" })
    );
    await waitFor(() => expect(store.getState().ui.dialog).toBeNull());

    const [post] = calls.to("POST /api/wallet/top-ups");
    expect(post.body).toEqual({ amount: 5_000 });
    expect(post.key).toBeTruthy();

    const state = store.getState();
    expect(state.walletUi.created.map((t) => t.id)).toEqual(["tx-top"]);
    expect(state.ui.toasts.at(-1)).toMatchObject({
      message: "Added 50.00 demo credits",
      action: { label: "Receipt", href: "/wallet/transactions/tx-top" },
    });
    // The wallet comes from the response; the limits (top-ups left) are re-read.
    await waitFor(() =>
      expect(store.getState().wallet.limits?.topUpsLeftToday).toBe(1)
    );
    expect(store.getState().wallet.wallet).toEqual(after);
  });

  it("disables amounts past the 1,000.00 cap, with the reason as text", async () => {
    api();
    renderTopUp(wallet({ balance: 96_000, available: 96_000 }));

    const [small, medium, large] = amounts() as HTMLInputElement[];
    expect(small.disabled).toBe(false);
    expect(small.checked).toBe(true);
    for (const option of [medium, large]) {
      expect(option.disabled).toBe(true);
      const reason = document.getElementById(
        option.getAttribute("aria-describedby") ?? ""
      );
      expect(reason?.textContent).toBe("Over the 1,000.00 cap");
    }
    expect(
      screen.getByRole("button", { name: "Add 25.00 demo credits" })
    ).toBeTruthy();
  });

  it("disables every amount once the day's top-ups are used", () => {
    api();
    renderTopUp(wallet(), limits({ topUpsLeftToday: 0 }));

    for (const option of amounts() as HTMLInputElement[]) {
      expect(option.disabled).toBe(true);
      expect(
        document.getElementById(option.getAttribute("aria-describedby") ?? "")
          ?.textContent
      ).toBe("Daily limit reached");
    }
    expect(dialog().textContent).toContain(
      "You’ve used all 3 top-ups for the last 24 hours."
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Add demo credits",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  it("keeps the key for a retry and changes it with the amount", async () => {
    const calls = api([
      fail(429, "rate_limited", "Too many requests, slow down"),
      fail(403, "wallet_frozen", "@illlhanozkan's wallet is frozen"),
      ok({ transfer: added, wallet: after }, 201),
    ]);
    renderTopUp();
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: "Add 50.00 demo credits" })
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "That’s a lot of payments in a minute. Wait a moment, then try again."
    );
    expect(
      screen
        .getByRole("button", { name: "Add 50.00 demo credits" })
        .getAttribute("aria-describedby")
    ).toBe(alert.id);

    await user.click(
      screen.getByRole("button", { name: "Add 50.00 demo credits" })
    );
    await screen.findByText(
      "A moderator froze your wallet. You can’t send or receive credits right now."
    );

    await user.click(screen.getByRole("radio", { name: "25.00" }));
    await user.click(
      screen.getByRole("button", { name: "Add 25.00 demo credits" })
    );

    const keys = calls.to("POST /api/wallet/top-ups").map((c) => c.key);
    expect(keys).toHaveLength(3);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("reads the limits first when the page has none", async () => {
    const calls = api();
    renderTopUp(wallet(), null);

    expect(await screen.findByRole("radio", { name: "25.00" })).toBeTruthy();
    expect(calls.to("GET /api/wallet")).toHaveLength(1);
  });
});

describe("topUpOptions", () => {
  it("allows amounts up to the cap exactly", () => {
    const options = topUpOptions(
      wallet({ balance: 95_000 }),
      limits({ topUpsLeftToday: 3 })
    );
    expect(options.map((o) => o.reason)).toEqual([
      null,
      null,
      "Over the 1,000.00 cap",
    ]);
  });
});
