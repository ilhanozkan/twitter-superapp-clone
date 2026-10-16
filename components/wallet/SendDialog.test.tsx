// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IDEMPOTENCY_KEY_PATTERN } from "../../lib/superapp/idempotency";
import { sessionState } from "../../slices/sessionSlice";
import { openDialog } from "../../slices/uiSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { IWallet } from "../../types/Wallet";
import { creditsDialogArgs } from "./dialogArgs";
import {
  fail,
  marco,
  ok,
  Reply,
  sarah,
  stubApi,
  transfer,
  wallet,
  walletState,
} from "./testing";
import WalletDialogs from "./WalletDialogs";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sent = transfer({ id: "tx-new", amount: 1_000, note: "Pizza 🍕" });
const after = wallet({ balance: 29_860, available: 29_860 });

function api(
  send: Reply | Reply[] = ok({ transfer: sent, wallet: after }, 201),
  current: IWallet = wallet({ available: 800, balance: 800 })
) {
  return stubApi({
    "GET /api/users": ok({
      items: [
        { ...sarah, accountType: "personal" },
        { ...testViewer, accountType: "personal" },
      ],
    }),
    "GET /api/users/sarahcodes": ok({ user: sarah }),
    "GET /api/users/nobody": fail(404, "not_found", "User not found"),
    "GET /api/wallet/activity": ok({
      items: [transfer({ id: "tx-old", from: marco, to: testViewer })],
      nextCursor: null,
    }),
    "GET /api/wallet": ok({
      wallet: current,
      limits: null,
      serverNow: new Date().toISOString(),
    }),
    "POST /api/wallet/transfers": send,
  });
}

function renderSend(args?: Record<string, string>, value: IWallet = wallet()) {
  const view = renderWithStore(<WalletDialogs />, {
    state: {
      session: sessionState({
        viewer: testViewer,
        readOnly: false,
        features: featuresWith("wallet"),
      }),
      wallet: walletState(value),
    },
  });
  act(() => {
    view.store.dispatch(openDialog("send", args));
  });
  return view;
}

const dialog = () => screen.getByRole("dialog", { name: "Send credits" });
const confirmButton = () =>
  screen.getByRole("button", { name: "Send 10.00 credits to Sarah Chen" });

async function chooseSarah(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole("combobox", { name: "To" }), "sar");
  await user.click(await screen.findByRole("option", { name: /Sarah Chen/ }));
}

async function toReview(
  user: ReturnType<typeof userEvent.setup>,
  amount = "10"
) {
  await user.type(
    screen.getByRole("textbox", { name: "Amount in credits" }),
    amount
  );
  await user.click(screen.getByRole("button", { name: "Review" }));
}

describe("SendDialog", () => {
  it("goes To → Amount & note → Review → Done and sends with an Idempotency-Key", async () => {
    const calls = api();
    const { store } = renderSend();
    const user = userEvent.setup();

    expect(dialog()).toBeTruthy();
    await chooseSarah(user);

    expect(within(dialog()).getByText("@sarahcodes")).toBeTruthy();
    await user.type(
      screen.getByRole("textbox", { name: "Amount in credits" }),
      "10"
    );
    await user.type(screen.getByRole("textbox", { name: /Note/ }), "Pizza 🍕");
    await user.click(screen.getByRole("button", { name: "Review" }));

    // The review (WCAG 3.3.4): who, how much, the note and the balance after.
    expect(dialog().textContent).toContain(
      "Send 10.00 credits to Sarah Chen (@sarahcodes)"
    );
    expect(within(dialog()).getByText("Pizza 🍕")).toBeTruthy();
    expect(within(dialog()).getByText("298.60 credits")).toBeTruthy();
    expect(document.activeElement).toBe(confirmButton());

    await user.click(confirmButton());

    expect(await screen.findByRole("heading", { name: "Sent" })).toBeTruthy();
    expect(dialog().textContent).toContain(
      "You sent 10.00 credits to Sarah Chen."
    );
    expect(
      screen.getByRole("link", { name: "View receipt" }).getAttribute("href")
    ).toBe("/wallet/transactions/tx-new");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Done" })
    );

    const [post] = calls.to("POST /api/wallet/transfers");
    expect(post.body).toEqual({
      to: "sarahcodes",
      amount: 1_000,
      note: "Pizza 🍕",
    });
    expect(post.key).toMatch(IDEMPOTENCY_KEY_PATTERN);

    // Never optimistic: the balance is the server's, and the toast links the receipt.
    const state = store.getState();
    expect(state.wallet.wallet).toEqual(after);
    expect(state.walletUi.created.map((t) => t.id)).toEqual(["tx-new"]);
    expect(state.ui.toasts.at(-1)).toMatchObject({
      message: "Sent 10.00 credits to Sarah Chen",
      action: { label: "Receipt", href: "/wallet/transactions/tx-new" },
    });

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(store.getState().ui.dialog).toBeNull();
  });

  it("suggests recent people as chips", async () => {
    api();
    renderSend();
    const user = userEvent.setup();

    const recent = await screen.findByRole("region", { name: "Recent" });
    await user.click(
      within(recent).getByRole("button", { name: /Marco Rossi/ })
    );
    expect(within(dialog()).getByText("@devmarco")).toBeTruthy();
  });

  it("moves Back between the steps, keeping what was typed", async () => {
    api();
    renderSend();
    const user = userEvent.setup();

    await chooseSarah(user);
    await toReview(user);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("textbox", { name: "Amount in credits" })
    ).toHaveProperty("value", "10");

    await user.click(screen.getByRole("button", { name: "Back" }));
    // The To step takes focus back: Back itself is gone.
    expect(document.activeElement).toBe(
      screen.getByRole("combobox", { name: "To" })
    );
  });

  it("asks for a valid amount before the review, and fills quick amounts", async () => {
    api();
    renderSend(creditsDialogArgs(sarah));
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByRole("alert").textContent).toBe("Enter an amount");
    const field = screen.getByRole("textbox", { name: "Amount in credits" });
    expect(document.activeElement).toBe(field);

    const quick = screen.getByRole("group", { name: "Quick amounts" });
    await user.click(within(quick).getByRole("button", { name: "20 credits" }));
    expect(field).toHaveProperty("value", "20.00");
    expect(
      within(quick)
        .getByRole("button", { name: "20 credits" })
        .getAttribute("aria-pressed")
    ).toBe("true");

    await user.click(screen.getByRole("button", { name: "Review" }));
    expect(
      screen.getByRole("button", { name: "Send 20.00 credits to Sarah Chen" })
    ).toBeTruthy();
  });

  it("locks the recipient when opened for someone, and prefills Send again", async () => {
    api();
    renderSend(creditsDialogArgs(sarah, { amount: 1_000, note: "Again" }));

    // Straight to the amount: no way back to choosing someone else.
    expect(within(dialog()).getByText("@sarahcodes")).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(
      screen.getByRole("textbox", { name: "Amount in credits" })
    ).toHaveProperty("value", "10.00");
    expect(screen.getByRole("textbox", { name: /Note/ })).toHaveProperty(
      "value",
      "Again"
    );
  });

  it("looks up a recipient given by username only", async () => {
    const calls = api();
    renderSend({ to: "sarahcodes" });
    expect(await within(dialog()).findByText("@sarahcodes")).toBeTruthy();
    expect(calls.to("GET /api/users/sarahcodes")).toHaveLength(1);
  });

  it("says so when that username doesn't exist, or is the viewer", async () => {
    api();
    renderSend({ to: "nobody" });
    expect((await screen.findByRole("alert")).textContent).toBe(
      "There's no account called @nobody."
    );
    cleanup();

    renderSend(creditsDialogArgs(testViewer));
    expect(screen.getByRole("alert").textContent).toBe(
      "You can’t send credits to yourself."
    );
  });

  describe("errors", () => {
    it("explains insufficient funds with an Add credits button", async () => {
      api();
      const { store } = renderSend(
        creditsDialogArgs(sarah),
        wallet({ balance: 800, available: 800 })
      );
      const user = userEvent.setup();

      await toReview(user);
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain(
        "You have 8.00 credits available. Add credits or lower the amount"
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
      const { store } = renderSend(creditsDialogArgs(sarah));
      const user = userEvent.setup();

      await toReview(user);
      await user.click(confirmButton());
      // The server's wallet (8.00) replaces the stale one, and the review says why.
      await waitFor(() =>
        expect(store.getState().wallet.wallet?.available).toBe(800)
      );
      expect(calls.to("GET /api/wallet")).toHaveLength(1);
      expect(screen.getByRole("alert").textContent).toContain(
        "You have 8.00 credits available"
      );
    });

    it("says whose wallet is frozen", async () => {
      api(
        [
          fail(403, "wallet_frozen", "@illlhanozkan's wallet is frozen"),
          fail(403, "wallet_frozen", "@sarahcodes's wallet is frozen"),
        ],
        wallet({ frozen: true })
      );
      const { store } = renderSend(creditsDialogArgs(sarah));
      const user = userEvent.setup();

      await toReview(user);
      await user.click(confirmButton());
      expect((await screen.findByRole("alert")).textContent?.trim()).toBe(
        "A moderator froze your wallet. You can’t send or receive credits right now."
      );
      // The wallet is read again, so the page's frozen banner shows too.
      await waitFor(() =>
        expect(store.getState().wallet.wallet?.frozen).toBe(true)
      );

      await user.click(confirmButton());
      await waitFor(() =>
        expect(screen.getByRole("alert").textContent?.trim()).toBe(
          "A moderator froze @sarahcodes’s wallet. Credits can’t move to or from it right now."
        )
      );
    });

    it("asks to slow down when rate limited", async () => {
      api(fail(429, "rate_limited", "Too many requests, slow down"));
      renderSend(creditsDialogArgs(sarah));
      const user = userEvent.setup();

      await toReview(user);
      await user.click(confirmButton());
      const alert = await screen.findByRole("alert");
      expect(alert.textContent?.trim()).toBe(
        "That’s a lot of payments in a minute. Wait a moment, then try again."
      );
      expect(confirmButton().getAttribute("aria-describedby")).toBe(alert.id);
    });
  });

  describe("the Idempotency-Key", () => {
    it("is reused by the automatic retry and by Retry, and survives Back", async () => {
      const calls = api([
        "network",
        "network",
        fail(429, "rate_limited", "Too many requests, slow down"),
        ok({ transfer: sent, wallet: after }, 201),
      ]);
      renderSend(creditsDialogArgs(sarah));
      const user = userEvent.setup();

      await toReview(user);
      // A network error is retried once, automatically, then shown.
      await user.click(confirmButton());
      expect((await screen.findByRole("alert")).textContent).toContain(
        "Check your connection"
      );
      await user.click(confirmButton());
      await screen.findByText(/a lot of payments/);

      // Back and forth without changes: still the same operation.
      await user.click(screen.getByRole("button", { name: "Back" }));
      await user.click(screen.getByRole("button", { name: "Review" }));
      await user.click(confirmButton());
      await screen.findByRole("heading", { name: "Sent" });

      const keys = calls.to("POST /api/wallet/transfers").map((c) => c.key);
      expect(keys).toHaveLength(4);
      expect(new Set(keys).size).toBe(1);
    });

    it("changes with the amount, and after a success", async () => {
      const calls = api([
        fail(429, "rate_limited", "Too many requests, slow down"),
        ok({ transfer: sent, wallet: after }, 201),
      ]);
      const { store } = renderSend(creditsDialogArgs(sarah));
      const user = userEvent.setup();

      await toReview(user);
      await user.click(confirmButton());
      await screen.findByRole("alert");

      await user.click(screen.getByRole("button", { name: "Back" }));
      await user.type(
        screen.getByRole("textbox", { name: "Amount in credits" }),
        "1"
      );
      await user.click(screen.getByRole("button", { name: "Review" }));
      await user.click(
        screen.getByRole("button", {
          name: "Send 101.00 credits to Sarah Chen",
        })
      );
      await screen.findByRole("heading", { name: "Sent" });

      // A new send after the success is a new operation.
      await user.click(screen.getByRole("button", { name: "Done" }));
      act(() => {
        store.dispatch(openDialog("send", creditsDialogArgs(sarah)));
      });
      await toReview(user);
      await user.click(confirmButton());
      await screen.findByRole("heading", { name: "Sent" });

      const keys = calls.to("POST /api/wallet/transfers").map((c) => c.key);
      expect(keys).toHaveLength(3);
      expect(new Set(keys).size).toBe(3);
    });
  });

  it("renders nothing while the wallet is off or the demo is read-only", () => {
    for (const session of [
      sessionState({
        viewer: testViewer,
        readOnly: false,
        features: featuresWith(),
      }),
      sessionState({
        viewer: testViewer,
        readOnly: true,
        features: featuresWith("wallet"),
      }),
    ]) {
      const { store } = renderWithStore(<WalletDialogs />, {
        state: { session },
      });
      act(() => {
        store.dispatch(openDialog("send"));
      });
      expect(screen.queryByRole("dialog")).toBeNull();
      cleanup();
    }
  });
});
