// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { sessionState } from "../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../test/render";
import { INotification } from "../types/Notification";
import { IFeatures } from "../types/Superapp";
import NotificationItem from "./NotificationItem";
import { viewNotification } from "./notifications/registry";

const sarah = { username: "sarahcodes", fullname: "Sarah Chen", image: null };
const base = { createdAt: "2026-10-09T12:00:00.000Z", actor: sarah };

afterEach(() => {
  cleanup();
});

function renderItem(
  notification: INotification,
  features: IFeatures = featuresWith("wallet")
) {
  renderWithStore(
    <NotificationItem
      notification={notification}
      viewerUsername={testViewer.username}
    />,
    {
      state: {
        session: sessionState({
          viewer: testViewer,
          readOnly: false,
          features,
        }),
      },
    }
  );
  // The card is one link; its text is the accessible name.
  return screen.getByRole("link");
}

describe("NotificationItem", () => {
  it("keeps the core types as before", () => {
    const link = renderItem({
      ...base,
      id: "like-1",
      type: "like",
      tweet: { id: "seed-t05", text: "Rebuilt the data layer" },
      reply: null,
    });
    expect(link.textContent).toBe("Sarah Chen liked your Tweet");
    expect(link.getAttribute("href")).toBe("/illlhanozkan/status/seed-t05");
    expect(screen.getByText("Rebuilt the data layer")).toBeTruthy();
  });

  it("says who tipped which Tweet and how much", () => {
    const link = renderItem({
      ...base,
      id: "tip-seed-tx02",
      type: "tip",
      tweet: { id: "seed-t05", text: "Rebuilt the data layer" },
      amount: 200,
      transferId: "seed-tx02",
    });
    expect(link.textContent).toBe("Sarah Chen tipped your Tweet 2.00 credits");
    expect(link.getAttribute("href")).toBe("/illlhanozkan/status/seed-t05");
  });

  it("links a tip on a deleted Tweet to its receipt", () => {
    const link = renderItem({
      ...base,
      id: "tip-x",
      type: "tip",
      tweet: null,
      amount: 100,
      transferId: "tx-1",
    });
    expect(link.getAttribute("href")).toBe("/wallet/transactions/tx-1");
    expect(screen.getByText("Tweet deleted")).toBeTruthy();
  });

  it("quotes a payment's note and links to the conversation only while Messages is on", () => {
    const payment: INotification = {
      ...base,
      actor: { username: "devmarco", fullname: "Marco Rossi", image: null },
      id: "pay-seed-tx03",
      type: "payment",
      amount: 1_500,
      note: "Thanks for the code review 🙏",
      transferId: "seed-tx03",
      conversationId: "dm-devmarco-illlhanozkan",
    };
    const link = renderItem(payment);
    expect(link.textContent).toBe(
      "Marco Rossi sent you 15.00 credits · “Thanks for the code review 🙏”"
    );
    expect(link.getAttribute("href")).toBe("/wallet/transactions/seed-tx03");
    cleanup();

    const withMessages = renderItem(
      payment,
      featuresWith("wallet", "messages")
    );
    expect(withMessages.getAttribute("href")).toBe(
      "/messages/dm-devmarco-illlhanozkan"
    );
  });

  it("renders requests and their answers", () => {
    expect(
      renderItem({
        ...base,
        id: "preq-seed-req01",
        type: "payment_request",
        amount: 450,
        note: "Coffee ☕",
        requestId: "seed-req01",
        conversationId: null,
      }).textContent
    ).toBe("Sarah Chen requested 4.50 credits · “Coffee ☕”");
    cleanup();

    const paid = renderItem({
      ...base,
      id: "preq-paid-seed-req02",
      type: "request_paid",
      amount: 1_000,
      requestId: "seed-req02",
      transferId: "seed-tx04",
    });
    expect(paid.textContent).toBe(
      "Sarah Chen paid your request for 10.00 credits"
    );
    expect(paid.getAttribute("href")).toBe("/wallet/transactions/seed-tx04");
    cleanup();

    expect(
      renderItem({
        ...base,
        id: "preq-declined-r",
        type: "request_declined",
        amount: 600,
        requestId: "r",
        transferId: null,
      }).textContent
    ).toBe("Sarah Chen declined your request for 6.00 credits");
  });

  it("falls back to the actor and a link for types no lane renders yet", () => {
    const link = renderItem({
      ...base,
      id: "order-delivered-o1",
      type: "order",
      event: "delivered",
      orderId: "o1",
      code: "K7Q2",
      business: "kizilaykahve",
    });
    expect(link.textContent).toBe("Sarah Chen");
    expect(link.getAttribute("href")).toBe("/orders/o1");
    // "<actor> · <time>"
    expect(
      link.parentElement?.querySelector("time")?.getAttribute("dateTime")
    ).toBe(base.createdAt);
  });

  it("lets a lane's renderers take over a type", () => {
    const view = viewNotification(
      {
        ...base,
        id: "ride-completed-r1",
        type: "ride",
        event: "completed",
        rideId: "r1",
        destination: "Atakule",
      },
      { viewer: "me", features: featuresWith("rides") },
      {
        ride: (notification) => ({
          icon: () => null,
          tone: "text-primary",
          text: `Your ride to ${notification.destination} is complete`,
          href: `/rides/${notification.rideId}`,
        }),
      }
    );
    expect(view.text).toBe("Your ride to Atakule is complete");
  });
});
