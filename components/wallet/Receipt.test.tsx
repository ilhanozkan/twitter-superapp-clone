// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { IFeatures } from "../../types/Superapp";
import { ITransfer } from "../../types/Wallet";
import Receipt from "./Receipt";
import { marco, sarah, transfer } from "./testing";

afterEach(() => {
  cleanup();
});

const NOW = "2026-10-09T12:00:00.000Z";

function renderReceipt(
  value: ITransfer,
  {
    tweetHref = null as string | null,
    features = featuresWith("wallet"),
    readOnly = false,
  }: {
    tweetHref?: string | null;
    features?: IFeatures;
    readOnly?: boolean;
  } = {}
) {
  return renderWithStore(
    <Receipt transfer={value} tweetHref={tweetHref} serverNow={NOW} />,
    {
      state: {
        session: sessionState({ viewer: testViewer, readOnly, features }),
      },
    }
  );
}

describe("Receipt", () => {
  it("shows a completed payment, signed from the viewer's side, with both parties", () => {
    renderReceipt(
      transfer({
        id: "tx-abc",
        note: "Pizza 🍕",
        createdAt: "2026-10-09T11:00:00.000Z",
      })
    );
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.getByText("sent 10.00 credits")).toBeTruthy();
    expect(screen.getByText("Payment to Sarah Chen")).toBeTruthy();
    expect(screen.getByText("Pizza 🍕")).toBeTruthy();
    expect(screen.getByText("TX-ABC")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Sarah Chen/ }).getAttribute("href")
    ).toBe("/sarahcodes");
  });

  it("shows a held credit as pending until its hold ends", () => {
    renderReceipt(
      transfer({
        kind: "order",
        from: marco,
        to: testViewer,
        holdUntil: "2026-10-09T14:35:00.000Z",
        context: { type: "order", id: "order-1", code: "K7Q2" },
      })
    );
    expect(
      screen.getByText(/Pending until/).textContent?.replace(/\s+/g, " ")
    ).toBe("Pending until 14:35 · refundable until then");
    expect(screen.getByText("received 10.00 credits")).toBeTruthy();
    // Orders are off here: the order is named, not linked.
    expect(screen.getByText("Order #K7Q2")).toBeTruthy();
  });

  it("shows a refunded credit with a link to the refund", () => {
    renderReceipt(
      transfer({
        kind: "order",
        holdUntil: "2026-10-09T14:35:00.000Z",
        reversedBy: "refund-tx-1",
      })
    );
    expect(screen.queryByText(/Pending until/)).toBeNull();
    expect(
      screen.getByRole("link", { name: "View refund" }).getAttribute("href")
    ).toBe("/wallet/transactions/refund-tx-1");
  });

  it("links the tipped Tweet, or says it was deleted", () => {
    const tip = transfer({
      kind: "tip",
      context: { type: "tweet", id: "seed-t03" },
    });
    renderReceipt(tip, { tweetHref: "/sarahcodes/status/seed-t03" });
    expect(
      screen.getByRole("link", { name: "Tweet" }).getAttribute("href")
    ).toBe("/sarahcodes/status/seed-t03");
    cleanup();

    renderReceipt(tip);
    expect(screen.getByText("Tweet deleted")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Tweet" })).toBeNull();
  });

  it("sends a payment again to the same person, prefilled", async () => {
    const { store } = renderReceipt(
      transfer({ amount: 1_250, note: "Pizza 🍕" })
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Send again" }));
    expect(store.getState().ui).toMatchObject({
      dialog: "send",
      dialogArgs: {
        to: "sarahcodes",
        name: "Sarah Chen",
        amount: "1250",
        note: "Pizza 🍕",
      },
    });
  });

  it("offers Send again only for payments the viewer made, outside read-only", () => {
    renderReceipt(transfer({ from: sarah, to: testViewer }));
    expect(screen.queryByRole("button", { name: "Send again" })).toBeNull();
    cleanup();

    renderReceipt(transfer({ kind: "tip" }));
    expect(screen.queryByRole("button", { name: "Send again" })).toBeNull();
    cleanup();

    renderReceipt(transfer(), { readOnly: true });
    expect(screen.queryByRole("button", { name: "Send again" })).toBeNull();
  });

  it("links a message to the other party while Messages is on", () => {
    renderReceipt(transfer({ from: sarah, to: testViewer }), {
      features: featuresWith("wallet", "messages"),
    });
    expect(
      screen
        .getByRole("link", { name: "Message Sarah Chen" })
        .getAttribute("href")
    ).toBe("/messages?to=sarahcodes");
  });
});
