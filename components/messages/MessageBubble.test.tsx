// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IDEMPOTENCY_KEY_PATTERN } from "../../lib/superapp/idempotency";
import { messagesState } from "../../slices/messagesSlice";
import { sessionState } from "../../slices/sessionSlice";
import { InitialState, useAppSelector } from "../../store";
import { featuresWith, renderWithStore } from "../../test/render";
import { IMessage } from "../../types/Message";
import { IPaymentRequest } from "../../types/Wallet";
import {
  at,
  CONVERSATION_ID,
  message,
  paymentRequest,
  sarah,
  thread,
  viewer,
} from "./testFixtures";

const walletApi = vi.hoisted(() => ({
  payRequest: vi.fn(),
  declineRequest: vi.fn(),
  cancelRequest: vi.fn(),
}));
vi.mock("../../lib/client/walletApi", () => ({ walletApi }));

const { default: MessageBubble } = await import("./MessageBubble");

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

/** The bubble as the list shows it: the message read from the store. */
function StoredBubble({ id }: { id: string }) {
  const stored = useAppSelector((state) =>
    state.messages.threads[CONVERSATION_ID].messages.find(
      (item) => item.id === id
    )
  );
  return stored ? (
    <MessageBubble message={stored} viewer={viewer.username} />
  ) : null;
}

function renderBubble(
  item: IMessage,
  { readOnly = false, walletOn = true } = {}
) {
  const state: InitialState = {
    session: sessionState({
      viewer,
      readOnly,
      features: walletOn
        ? featuresWith("messages", "wallet")
        : featuresWith("messages"),
    }),
    wallet: { wallet, limits: null, loaded: true },
    messages: {
      ...messagesState([]),
      threads: { [CONVERSATION_ID]: thread([item]) },
    },
  };
  return renderWithStore(<StoredBubble id={item.id} />, { state });
}

const requestMessage = (request: IPaymentRequest) =>
  message("m-req", request.requester, at("07:00"), {
    type: "request",
    request,
  });

describe("text bubbles", () => {
  it("links mentions and shows a shared Tweet as a card linking to it", () => {
    renderBubble(
      message("m1", sarah, at("09:00"), {
        type: "text",
        text: "Look @devmarco",
        tweet: { id: "seed-t05", author: viewer, text: "Wallets are live" },
        story: null,
      })
    );
    expect(
      screen.getByRole("link", { name: "@devmarco" }).getAttribute("href")
    ).toBe("/devmarco");
    const card = screen.getByRole("link", { name: /Shared Tweet by Ilhan/ });
    expect(card.getAttribute("href")).toBe("/illlhanozkan/status/seed-t05");
    expect(card.textContent).toContain("Wallets are live");
  });

  it("says when a shared Tweet is gone", () => {
    renderBubble(
      message("m1", sarah, at("09:00"), {
        type: "text",
        text: "",
        tweet: null,
        story: null,
      })
    );
    expect(screen.getByText("This Tweet is no longer available")).toBeTruthy();
  });

  it("shows a story reply with its preview, or that the story is gone", () => {
    renderBubble(
      message("m1", sarah, at("09:00"), {
        type: "text",
        text: "Love it",
        tweet: null,
        story: {
          id: "s1",
          author: viewer,
          preview: {
            type: "image",
            image: "/media/coffee.svg",
            alt: "A cup of Turkish coffee",
            caption: null,
          },
        },
      })
    );
    expect(screen.getByText("Sarah Chen replied to your story")).toBeTruthy();
    expect(screen.getByAltText("A cup of Turkish coffee")).toBeTruthy();
    cleanup();

    renderBubble(
      message("m2", viewer, at("09:00"), {
        type: "text",
        text: "Nice",
        tweet: null,
        story: { id: "s1", author: sarah, preview: null },
      })
    );
    expect(screen.getByText("You replied to Sarah Chen’s story")).toBeTruthy();
    expect(screen.getByText("Story no longer available")).toBeTruthy();
  });

  it("says who removed a message", () => {
    renderBubble(
      message("m1", sarah, at("09:00"), { type: "removed", by: "moderator" })
    );
    expect(screen.getByText("Message removed by a moderator")).toBeTruthy();
  });
});

describe("payment bubbles", () => {
  const payment = message("m1", sarah, at("09:00"), {
    type: "payment",
    transferId: "seed-tx03",
    amount: 1_500,
    note: "Thanks for the code review 🙏",
  });

  it("states the amount from the viewer's side and links the receipt", () => {
    renderBubble(payment);
    expect(screen.getByText("Sarah Chen sent you 15.00 credits")).toBeTruthy();
    expect(screen.getByText("Thanks for the code review 🙏")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "View receipt" }).getAttribute("href")
    ).toBe("/wallet/transactions/seed-tx03");
  });

  it("has no receipt link while the wallet is off", () => {
    renderBubble({ ...payment, author: viewer }, { walletOn: false });
    expect(screen.getByText("You sent 15.00 credits")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View receipt" })).toBeNull();
  });
});

describe("request bubbles", () => {
  it("offers the payer Pay and Decline while pending", () => {
    renderBubble(requestMessage(paymentRequest()));
    expect(
      screen.getByText("Sarah Chen requested 4.50 credits", { exact: false })
    ).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pay 4.50" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Decline request" })
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel request" })).toBeNull();
  });

  it("offers the requester Cancel while pending", () => {
    renderBubble(
      requestMessage(paymentRequest({ requester: viewer, payer: sarah }))
    );
    expect(
      screen.getByText("You requested 4.50 credits from Sarah Chen", {
        exact: false,
      })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel request" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Pay/ })).toBeNull();
  });

  it("shows the outcome, and a receipt once paid, with no actions", () => {
    renderBubble(
      requestMessage(paymentRequest({ status: "paid", transferId: "tx-9" }))
    );
    expect(screen.getByText("Paid")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "View receipt" }).getAttribute("href")
    ).toBe("/wallet/transactions/tx-9");
    expect(screen.queryByRole("button")).toBeNull();
    cleanup();

    for (const [status, label] of [
      ["declined", "Declined"],
      ["cancelled", "Cancelled"],
      ["expired", "Expired"],
    ] as const) {
      renderBubble(requestMessage(paymentRequest({ status })));
      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.queryByRole("button")).toBeNull();
      cleanup();
    }
  });

  it("has no actions in READ_ONLY or while the wallet is off", () => {
    renderBubble(requestMessage(paymentRequest()), { readOnly: true });
    expect(screen.queryByRole("button")).toBeNull();
    cleanup();
    renderBubble(requestMessage(paymentRequest()), { walletOn: false });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("declines, then shows the new status and keeps focus on the bubble", async () => {
    const user = userEvent.setup();
    walletApi.declineRequest.mockResolvedValue({
      request: paymentRequest({ status: "declined" }),
    });
    renderBubble(requestMessage(paymentRequest()));

    await user.click(screen.getByRole("button", { name: "Decline request" }));
    expect(walletApi.declineRequest).toHaveBeenCalledWith("seed-req01");
    await screen.findByText("Declined");
    expect(screen.queryByRole("button", { name: /^Pay/ })).toBeNull();
    expect(document.activeElement?.textContent).toContain("Declined");
  });

  it("shows why an answer failed", async () => {
    const user = userEvent.setup();
    walletApi.cancelRequest.mockRejectedValue(new Error("Request not found"));
    renderBubble(
      requestMessage(paymentRequest({ requester: viewer, payer: sarah }))
    );
    await user.click(screen.getByRole("button", { name: "Cancel request" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Request not found"
    );
  });

  it("pays after the review, with a key, and updates the wallet", async () => {
    const user = userEvent.setup();
    walletApi.payRequest.mockResolvedValue({
      request: paymentRequest({ status: "paid", transferId: "tx-paid" }),
      transfer: { id: "tx-paid" },
      wallet: { ...wallet, balance: 30_410, available: 30_410 },
    });
    const { store } = renderBubble(requestMessage(paymentRequest()));

    await user.click(screen.getByRole("button", { name: "Pay 4.50" }));
    const dialog = screen.getByRole("dialog", { name: "Pay request" });
    expect(within(dialog).getByText("Coffee ☕")).toBeTruthy();
    await user.click(
      within(dialog).getByRole("button", {
        name: "Pay 4.50 credits to Sarah Chen",
      })
    );

    await waitFor(() => expect(screen.getByText("Paid")).toBeTruthy());
    const [requestId, key] = walletApi.payRequest.mock.calls[0];
    expect(requestId).toBe("seed-req01");
    expect(key).toMatch(IDEMPOTENCY_KEY_PATTERN);
    expect(store.getState().wallet.wallet?.available).toBe(30_410);
    expect(store.getState().ui.toasts[0]).toMatchObject({
      message: "You paid Sarah Chen 4.50 credits",
      action: { label: "Receipt", href: "/wallet/transactions/tx-paid" },
    });
  });
});
