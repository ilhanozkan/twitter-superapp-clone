// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ordersState } from "../../slices/ordersSlice";
import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { stubFetch } from "../shop/testing";
import MerchantBoard, { BoardData, summaryText } from "./MerchantBoard";
import { at, iso, marco, order, wallet } from "./testing";

// The Business board: the /business Orders tab.

const superapp = {
  username: "superapp",
  fullname: "Twitter SuperApp",
  image: null,
  category: "shop" as const,
};
const mugLine = {
  productId: "seed-p-sa-mug",
  name: "SuperApp mug",
  unitPrice: 1_200,
  quantity: 1,
  total: 1_200,
};
const fromMarco = order(
  {
    id: "seed-o03",
    code: "M2X9",
    buyer: marco,
    business: superapp,
    lines: [mugLine],
    subtotal: 1_200,
    deliveryFee: 300,
    total: 1_500,
    paymentTransferId: "seed-tx-o03",
  },
  { timeScale: 1, now: at(120) }
);
const fromSarah = order(
  {
    id: "seed-o02",
    code: "P4R8",
    buyer: { username: "sarahcodes", fullname: "Sarah Chen", image: null },
    business: superapp,
  },
  { placedAfter: -86_400, now: at(120) }
);
const demo = order(
  {
    id: "order-demo",
    code: "D3M0",
    placedBy: "demo_bot",
    buyer: {
      username: "demo_customer",
      fullname: "Demo customer",
      image: null,
    },
    business: superapp,
  },
  { placedAfter: 119, timeScale: 1, now: at(120) }
);

const summary = { orders: 1, revenue: 1_500, pending: 1_500, fromTweets: 0 };

function setup({ readOnly = false } = {}) {
  const api = stubFetch({
    "/api/orders/seed-o03/cancel": () => [
      200,
      {
        order: order(
          {
            ...fromMarco,
            cancelledAt: iso(121),
            cancelledBy: "business",
            refundTransferId: "refund-seed-tx-o03",
          },
          { timeScale: 1, now: at(121) }
        ),
        wallet: wallet(30_860),
        serverNow: iso(121),
      },
    ],
    "/api/businesses/superapp/demo-orders": () => [
      201,
      { order: demo, serverNow: iso(120) },
    ],
    "/api/businesses/superapp/summary": () => [
      200,
      {
        summary: { ...summary, orders: 2, revenue: 2_150, pending: 2_150 },
        wallet: wallet(600, "superapp"),
        since: iso(0),
        serverNow: iso(120),
      },
    ],
    "/api/orders": () => [
      200,
      { items: [fromMarco], nextCursor: null, serverNow: iso(120) },
    ],
    "/api/activity": () => [
      200,
      {
        serverNow: iso(120),
        unreadConversations: 0,
        newNotifications: 0,
        live: [],
      },
    ],
  });
  vi.stubGlobal("fetch", vi.fn(api.fetch));
  const data: BoardData = {
    summary,
    wallet: { ...wallet(600, "superapp"), balance: 2_100, pending: 1_500 },
    since: iso(0),
    ids: [fromMarco.id, fromSarah.id],
    nextCursor: null,
    serverNow: iso(120),
  };
  const result = renderWithStore(
    <>
      <p id="reason">Changes are turned off on this read-only demo.</p>
      <MerchantBoard
        business={{ username: "superapp", fullname: "Twitter SuperApp" }}
        data={data}
        reasonId={readOnly ? "reason" : undefined}
      />
    </>,
    {
      path: "/business",
      state: {
        session: sessionState({
          viewer: testViewer,
          readOnly,
          features: featuresWith("wallet", "shop", "orders"),
        }),
        orders: ordersState([fromMarco, fromSarah], iso(120)),
      },
    }
  );
  return { ...result, calls: api.calls };
}

const section = (name: string) => screen.getByRole("region", { name });
const codes = (name: string) =>
  within(section(name))
    .queryAllByRole("heading", { level: 3 })
    .map((heading) => heading.textContent);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MerchantBoard", () => {
  it("sums up today and lists the orders in progress and completed", () => {
    setup();
    expect(
      screen.getByText("Today: 1 order · 15.00 credits · 15.00 pending")
    ).toBeTruthy();
    expect(
      screen.getByText("Wallet · Available 6.00 · Pending 15.00 credits")
    ).toBeTruthy();
    expect(codes("In progress")).toEqual(["#M2X9 · Marco Rossi"]);
    expect(codes("Completed")).toEqual(["#P4R8 · Sarah Chen"]);
    expect(section("In progress").textContent).toContain("SuperApp mug ×1");
    expect(
      summaryText({ orders: 0, revenue: 0, pending: 0, fromTweets: 0 })
    ).toBe("No orders yet today");
  });

  it("cancels and refunds behind a confirmation, then moves the order", async () => {
    const { calls, store } = setup();
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel & refund #M2X9" })
    );
    const dialog = screen.getByRole("dialog", { name: "Cancel and refund?" });
    expect(dialog.textContent).toContain(
      "Marco Rossi gets 15.00 credits back for order #M2X9."
    );
    await userEvent.click(
      within(dialog).getByRole("button", {
        name: "Cancel & refund 15.00 credits",
      })
    );

    await waitFor(() => expect(codes("In progress")).toEqual([]));
    expect(codes("Completed")).toEqual([
      "#M2X9 · Marco Rossi",
      "#P4R8 · Sarah Chen",
    ]);
    expect(section("Completed").textContent).toContain(
      "You cancelled · refunded"
    );
    const post = calls.find((call) => call.path.endsWith("/cancel"))!;
    expect(JSON.parse(String(post.init?.body))).toEqual({ as: "business" });
    expect(store.getState().ui.toasts.map((toast) => toast.message)).toEqual([
      "Order #M2X9 cancelled · 15.00 credits refunded to Marco Rossi",
    ]);
    // The board's numbers are read again.
    await waitFor(() =>
      expect(calls.some((call) => call.path.includes("/summary?"))).toBe(true)
    );
  });

  it("adds the Demo bot's order to the board", async () => {
    const { calls } = setup();
    await userEvent.click(
      screen.getByRole("button", {
        name: "Simulate a customer order · Demo bot",
      })
    );
    await waitFor(() =>
      expect(codes("In progress")).toEqual([
        "#D3M0 · Demo customer",
        "#M2X9 · Marco Rossi",
      ])
    );
    expect(within(section("In progress")).getByText("Demo bot")).toBeTruthy();
    const post = calls.find((call) => call.path.endsWith("/demo-orders"))!;
    expect(new Headers(post.init?.headers).get("Idempotency-Key")).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByText("Today: 2 orders · 21.50 credits · 21.50 pending")
      ).toBeTruthy()
    );
  });

  it("disables Cancel and the Demo bot on a read-only demo, saying why", async () => {
    const { calls } = setup({ readOnly: true });
    for (const name of [
      "Cancel & refund #M2X9",
      "Simulate a customer order · Demo bot",
    ]) {
      const button = screen.getByRole("button", { name });
      expect(button.getAttribute("aria-disabled")).toBe("true");
      expect(button.getAttribute("aria-describedby")).toBe("reason");
      await userEvent.click(button);
    }
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls.some((call) => call.init?.method === "POST")).toBe(false);
  });
});
