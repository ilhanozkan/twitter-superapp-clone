// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../lib/client/request";
import { IDEMPOTENCY_KEY_PATTERN } from "../../lib/superapp/idempotency";
import { messagesState } from "../../slices/messagesSlice";
import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore } from "../../test/render";
import {
  at,
  CONVERSATION_ID,
  message,
  paymentRequest,
  sarah,
  thread,
  viewer,
} from "./testFixtures";

const api = vi.hoisted(() => ({
  openConversation: vi.fn(),
  sendPayment: vi.fn(),
  sendRequest: vi.fn(),
}));
vi.mock("../../lib/client/messagesApi", () => ({ messagesApi: api }));

const { default: ChatMoneySheet } = await import("./ChatMoneySheet");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const wallet = {
  username: viewer.username,
  balance: 30_860,
  pending: 0,
  available: 30_860,
  frozen: false,
};

function renderSheet(mode: "send" | "request", onClose = vi.fn()) {
  const result = renderWithStore(
    <ChatMoneySheet
      mode={mode}
      other={sarah}
      conversationId={CONVERSATION_ID}
      onClose={onClose}
    />,
    {
      state: {
        session: sessionState({
          viewer,
          readOnly: false,
          features: featuresWith("messages", "wallet"),
        }),
        wallet: { wallet, limits: null, loaded: true },
        messages: {
          ...messagesState([]),
          threads: { [CONVERSATION_ID]: thread([]) },
        },
      },
    }
  );
  return { ...result, onClose };
}

describe("ChatMoneySheet", () => {
  it("sends credits after the review and posts the payment in the chat", async () => {
    const user = userEvent.setup();
    const payment = message("m-pay", viewer, at("12:00"), {
      type: "payment",
      transferId: "tx-1",
      amount: 500,
      note: "Lunch",
    });
    api.sendPayment.mockResolvedValue({
      message: payment,
      transfer: { id: "tx-1" },
      wallet: { ...wallet, balance: 30_360, available: 30_360 },
    });
    const { store, onClose } = renderSheet("send");
    const dialog = screen.getByRole("dialog", { name: "Send credits" });
    expect(within(dialog).getByText("From your available")).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "5.00" }));
    expect(
      within(dialog)
        .getByRole("button", { name: "5.00" })
        .getAttribute("aria-pressed")
    ).toBe("true");
    await user.type(within(dialog).getByLabelText(/Note/), "Lunch");
    await user.click(within(dialog).getByRole("button", { name: "Review" }));

    const confirm = within(dialog).getByRole("button", {
      name: "Send 5.00 credits to Sarah Chen",
    });
    expect(document.activeElement).toBe(confirm);
    expect(within(dialog).getByText("303.60 credits")).toBeTruthy();
    await user.click(confirm);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [id, body, key] = api.sendPayment.mock.calls[0];
    expect(id).toBe(CONVERSATION_ID);
    expect(body).toEqual({ amount: 500, note: "Lunch" });
    expect(key).toMatch(IDEMPOTENCY_KEY_PATTERN);
    const state = store.getState();
    expect(state.wallet.wallet?.available).toBe(30_360);
    expect(state.messages.threads[CONVERSATION_ID].messages).toEqual([payment]);
    expect(state.ui.toasts[0]).toMatchObject({
      message: "You sent Sarah Chen 5.00 credits",
      action: { href: "/wallet/transactions/tx-1" },
    });
  });

  it("retries a failed send with the same key, also after Back", async () => {
    const user = userEvent.setup();
    api.sendPayment.mockRejectedValue(
      new ApiRequestError(
        429,
        "rate_limited",
        "Too many payments. Wait a minute."
      )
    );
    renderSheet("send");
    const dialog = screen.getByRole("dialog", { name: "Send credits" });
    await user.type(within(dialog).getByLabelText("Amount in credits"), "2");
    await user.click(within(dialog).getByRole("button", { name: "Review" }));
    const confirmName = "Send 2.00 credits to Sarah Chen";
    await user.click(within(dialog).getByRole("button", { name: confirmName }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain(
      "Too many payments"
    );

    await user.click(within(dialog).getByRole("button", { name: "Back" }));
    expect(
      (within(dialog).getByLabelText("Amount in credits") as HTMLInputElement)
        .value
    ).toBe("2");
    await user.click(within(dialog).getByRole("button", { name: "Review" }));
    await user.click(within(dialog).getByRole("button", { name: confirmName }));
    await waitFor(() => expect(api.sendPayment).toHaveBeenCalledTimes(2));
    expect(api.sendPayment.mock.calls[1][2]).toBe(
      api.sendPayment.mock.calls[0][2]
    );
  });

  it("requests credits with its own review: nothing leaves the wallet", async () => {
    const user = userEvent.setup();
    api.sendRequest.mockResolvedValue({
      message: message("m-req", viewer, at("12:00"), {
        type: "request",
        request: paymentRequest({ requester: viewer, payer: sarah }),
      }),
      request: paymentRequest({ requester: viewer, payer: sarah }),
    });
    const { store, onClose } = renderSheet("request");
    const dialog = screen.getByRole("dialog", { name: "Request credits" });
    expect(within(dialog).queryByText("From your available")).toBeNull();
    await user.type(within(dialog).getByLabelText("Amount in credits"), "4.5");
    await user.type(within(dialog).getByLabelText(/Note/), "Coffee ☕");
    await user.click(within(dialog).getByRole("button", { name: "Review" }));

    const confirm = within(dialog).getByRole("button", {
      name: "Request 4.50 credits from Sarah Chen",
    });
    expect(document.activeElement).toBe(confirm);
    expect(within(dialog).queryByText("Balance after")).toBeNull();
    await user.click(confirm);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.sendRequest.mock.calls[0].slice(0, 2)).toEqual([
      CONVERSATION_ID,
      { amount: 450, note: "Coffee ☕" },
    ]);
    expect(store.getState().ui.toasts[0].message).toBe(
      "Request sent. You’ll get a notification when Sarah Chen pays."
    );
  });

  it("won't review amounts outside the limits or notes over 100 characters", async () => {
    const user = userEvent.setup();
    renderSheet("request");
    const dialog = screen.getByRole("dialog", { name: "Request credits" });
    const review = within(dialog).getByRole("button", { name: "Review" });

    await user.type(within(dialog).getByLabelText("Amount in credits"), "0.10");
    expect((review as HTMLButtonElement).disabled).toBe(true);
    await user.clear(within(dialog).getByLabelText("Amount in credits"));
    await user.type(within(dialog).getByLabelText("Amount in credits"), "3");
    expect((review as HTMLButtonElement).disabled).toBe(false);

    await user.click(within(dialog).getByLabelText(/Note/));
    await user.paste("x".repeat(101));
    expect((review as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialog).getByText(/Shorten the note/)).toBeTruthy();
  });

  it("opens a draft conversation before its first payment", async () => {
    const user = userEvent.setup();
    api.openConversation.mockResolvedValue({
      conversation: {
        id: CONVERSATION_ID,
        kind: "direct",
        other: sarah,
        lastMessage: null,
        unread: 0,
        otherReadAt: null,
        updatedAt: at("12:00"),
      },
    });
    api.sendPayment.mockResolvedValue({
      message: message("m-pay", viewer, at("12:00"), {
        type: "payment",
        transferId: "tx-2",
        amount: 200,
        note: null,
      }),
      transfer: { id: "tx-2" },
      wallet,
    });
    renderWithStore(
      <ChatMoneySheet
        mode="send"
        other={sarah}
        conversationId={CONVERSATION_ID}
        openWith="sarahcodes"
        onClose={() => {}}
      />,
      {
        state: {
          session: sessionState({
            viewer,
            readOnly: false,
            features: featuresWith("messages", "wallet"),
          }),
          wallet: { wallet, limits: null, loaded: true },
        },
      }
    );
    const dialog = screen.getByRole("dialog", { name: "Send credits" });
    await user.click(within(dialog).getByRole("button", { name: "2.00" }));
    await user.click(within(dialog).getByRole("button", { name: "Review" }));
    await user.click(
      within(dialog).getByRole("button", {
        name: "Send 2.00 credits to Sarah Chen",
      })
    );
    await waitFor(() => expect(api.sendPayment).toHaveBeenCalled());
    expect(api.openConversation).toHaveBeenCalledWith("sarahcodes");
  });
});
