// @vitest-environment jsdom
import { act, cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import { openDialog } from "../../slices/uiSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { creditsDialogArgs } from "./dialogArgs";
import {
  fail,
  ok,
  paymentRequest,
  Reply,
  sarah,
  stubApi,
  wallet,
  walletState,
} from "./testing";
import WalletDialogs from "./WalletDialogs";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const created = paymentRequest({
  id: "req-new",
  requester: testViewer,
  payer: sarah,
  amount: 1_000,
  note: "Lunch",
});

function api(create: Reply | Reply[] = ok({ request: created }, 201)) {
  return stubApi({
    "GET /api/users": ok({ items: [{ ...sarah, accountType: "personal" }] }),
    "GET /api/wallet/activity": ok({ items: [], nextCursor: null }),
    "GET /api/wallet": ok({
      wallet: wallet(),
      limits: null,
      serverNow: new Date().toISOString(),
    }),
    "POST /api/wallet/requests": create,
  });
}

function renderRequest(args?: Record<string, string>) {
  const view = renderWithStore(<WalletDialogs />, {
    state: {
      session: sessionState({
        viewer: testViewer,
        readOnly: false,
        features: featuresWith("wallet"),
      }),
      wallet: walletState(wallet({ balance: 0, available: 0 })),
    },
  });
  act(() => {
    view.store.dispatch(openDialog("request", args));
  });
  return view;
}

const dialog = () => screen.getByRole("dialog", { name: "Request credits" });
const confirmButton = () =>
  screen.getByRole("button", { name: "Request 10.00 credits from Sarah Chen" });

async function toReview(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByRole("textbox", { name: "Amount in credits" }),
    "10"
  );
  await user.type(screen.getByRole("textbox", { name: /Note/ }), "Lunch");
  await user.click(screen.getByRole("button", { name: "Review" }));
}

describe("RequestDialog", () => {
  it("goes From → Amount & note → Review → Done and asks with a key", async () => {
    const calls = api();
    const { store } = renderRequest();
    const user = userEvent.setup();

    await user.type(screen.getByRole("combobox", { name: "From" }), "sar");
    await user.click(await screen.findByRole("option", { name: /Sarah Chen/ }));
    await toReview(user);

    // Asking moves nothing: no balance to check, even at 0.00 available.
    expect(dialog().textContent).toContain(
      "Request 10.00 credits from Sarah Chen (@sarahcodes)"
    );
    expect(within(dialog()).queryByText("Balance after")).toBeNull();
    expect(document.activeElement).toBe(confirmButton());

    await user.click(confirmButton());
    expect(
      await screen.findByRole("heading", { name: "Request sent" })
    ).toBeTruthy();
    expect(dialog().textContent).toContain(
      "You’ll get a notification when Sarah Chen pays."
    );
    expect(
      screen
        .getByRole("link", { name: "View your requests" })
        .getAttribute("href")
    ).toBe("/wallet?tab=requests");

    const [post] = calls.to("POST /api/wallet/requests");
    expect(post.body).toEqual({
      from: "sarahcodes",
      amount: 1_000,
      note: "Lunch",
    });
    expect(post.key).toBeTruthy();

    const state = store.getState();
    expect(state.walletUi.requests.outgoing.map((r) => r.id)).toEqual([
      "req-new",
    ]);
    expect(state.walletUi.recent.people[0].username).toBe("sarahcodes");
    expect(state.ui.toasts.at(-1)).toMatchObject({
      message: "Requested 10.00 credits from Sarah Chen",
      action: { href: "/wallet?tab=requests" },
    });
  });

  it("moves Back from the review to the amount", async () => {
    api();
    renderRequest(creditsDialogArgs(sarah));
    const user = userEvent.setup();

    await toReview(user);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("textbox", { name: "Amount in credits" })
    ).toHaveProperty("value", "10");
    // Opened for Sarah: there is no step before this one.
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("shows errors inline and retries with the same key", async () => {
    const calls = api([
      fail(422, "limit_exceeded", "You already have 10 pending requests"),
      fail(403, "wallet_frozen", "@sarahcodes's wallet is frozen"),
      fail(429, "rate_limited", "Too many requests, slow down"),
    ]);
    renderRequest(creditsDialogArgs(sarah));
    const user = userEvent.setup();

    await toReview(user);
    await user.click(confirmButton());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("You already have 10 pending requests");
    expect(confirmButton().getAttribute("aria-describedby")).toBe(alert.id);

    await user.click(confirmButton());
    await screen.findByText(
      "A moderator froze @sarahcodes’s wallet. Credits can’t move to or from it right now."
    );
    await user.click(confirmButton());
    await screen.findByText(
      "That’s a lot of payments in a minute. Wait a moment, then try again."
    );

    const keys = calls.to("POST /api/wallet/requests").map((c) => c.key);
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(1);
  });

  it("uses a new key once the note changes", async () => {
    const calls = api([
      fail(429, "rate_limited", "Too many requests, slow down"),
      ok({ request: created }, 201),
    ]);
    renderRequest(creditsDialogArgs(sarah));
    const user = userEvent.setup();

    await toReview(user);
    await user.click(confirmButton());
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.type(screen.getByRole("textbox", { name: /Note/ }), " 🍜");
    await user.click(screen.getByRole("button", { name: "Review" }));
    await user.click(confirmButton());
    await screen.findByRole("heading", { name: "Request sent" });

    const keys = calls.to("POST /api/wallet/requests").map((c) => c.key);
    expect(keys[1]).not.toBe(keys[0]);
    expect(calls.to("POST /api/wallet/requests")[1].body).toMatchObject({
      note: "Lunch 🍜",
    });
  });
});
