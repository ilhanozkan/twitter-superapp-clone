// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getPlace } from "../../lib/superapp/places";
import { initialActivityState } from "../../slices/activitySlice";
import { ordersState } from "../../slices/ordersSlice";
import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { IOrder } from "../../types/Order";
import { stubFetch } from "../shop/testing";
import { clockText, tweetAboutIt } from "./format";
import OrderTracker from "./OrderTracker";
import { at, iso, order, wallet } from "./testing";

// The tracker (§4.8): stepper semantics, status announced once per change,
// polling, cancel within the window, and what follows a delivery.

const kizilay = getPlace("kizilay");

function setup({
  initial = order(),
  serverNow = iso(1),
  side = "buyer" as "buyer" | "business",
  readOnly = false,
  inLiveActivity = false,
}: {
  initial?: IOrder;
  serverNow?: string;
  side?: "buyer" | "business";
  readOnly?: boolean;
  inLiveActivity?: boolean;
} = {}) {
  const api = stubFetch({
    // The order as the (fake) clock has it now.
    "/api/orders/order-abc": () => [
      200,
      {
        order: order({}, { now: new Date() }),
        serverNow: new Date().toISOString(),
      },
    ],
    "/api/orders/order-abc/cancel": () => [
      200,
      {
        order: order(
          {
            cancelledAt: iso(4),
            cancelledBy: "buyer",
            refundTransferId: "refund-order-abc-1",
          },
          { now: at(4) }
        ),
        wallet: wallet(30_860),
        serverNow: iso(4),
      },
    ],
    "/api/activity": () => [
      200,
      {
        serverNow: iso(4),
        unreadConversations: 0,
        newNotifications: 0,
        live: [],
      },
    ],
  });
  vi.stubGlobal("fetch", vi.fn(api.fetch));
  const result = renderWithStore(
    <OrderTracker
      initial={{ order: initial, serverNow }}
      from={kizilay}
      side={side}
    />,
    {
      path: "/orders/order-abc",
      state: {
        session: sessionState({
          viewer: testViewer,
          readOnly,
          features: featuresWith("wallet", "shop", "orders"),
        }),
        orders: ordersState([initial], serverNow),
        activity: {
          ...initialActivityState,
          live: inLiveActivity
            ? [
                {
                  kind: "order",
                  id: initial.id,
                  title: "Order from Kızılay Kahve",
                  status: "Placed",
                  eta: initial.deliverAt,
                  href: "/orders/order-abc",
                  nextChangeAt: initial.acceptAt,
                },
              ]
            : [],
        },
      },
    }
  );
  return { ...result, calls: api.calls };
}

const liveRegion = () =>
  document.querySelector<HTMLElement>('p[aria-live="polite"]')!;
const currentStep = () =>
  within(screen.getByRole("region", { name: "Progress" }))
    .getAllByRole("listitem")
    .find((item) => item.getAttribute("aria-current") === "step")?.textContent;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("OrderTracker over time", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(at(1));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });

  /** What the live region says, second by second, until `seconds`. */
  async function listen(seconds: number) {
    const heard: string[] = [];
    for (let second = 1; second < seconds; second++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      const text = liveRegion().textContent ?? "";
      if (text && text !== heard.at(-1)) heard.push(text);
    }
    return heard;
  }

  it("marks the current stage and announces each change once", async () => {
    const { calls } = setup();
    expect(currentStep()).toMatch(/^Placed/);
    expect(liveRegion().textContent).toBe("");

    const eta = clockText(order().deliverAt);
    expect(await listen(40)).toEqual([
      `Accepted · Arrives around ${eta}`,
      `On the way · Arrives around ${eta}`,
      `Delivered at ${eta}`,
    ]);
    expect(currentStep()).toMatch(/^Delivered/);
    expect(
      screen.getByRole("heading", { level: 2, name: /^Delivered at/ })
    ).toBeTruthy();

    // Polled while on its way, then never again.
    const polls = () =>
      calls.filter((call) => call.path === "/api/orders/order-abc").length;
    const settled = polls();
    expect(settled).toBeGreaterThan(3);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(polls()).toBe(settled);
  });

  it("leaves what the shell's live activity reads out to it", async () => {
    setup({ inLiveActivity: true });
    expect(await listen(40)).toEqual([
      `Delivered at ${clockText(order().deliverAt)}`,
    ]);
  });

  it("stops polling while the tab is hidden", async () => {
    let visibility: DocumentVisibilityState = "hidden";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    const { calls } = setup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(
      calls.filter((call) => call.path === "/api/orders/order-abc")
    ).toHaveLength(0);

    visibility = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(
      calls.filter((call) => call.path === "/api/orders/order-abc")
    ).toHaveLength(1);
  });
});

describe("OrderTracker actions", () => {
  it("cancels within the window, refunding in full", async () => {
    const { calls, store } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    const dialog = screen.getByRole("dialog", { name: "Cancel this order?" });
    expect(dialog.textContent).toContain(
      "Order #K7Q2 from Kızılay Kahve. You get 6.50 credits back in full."
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel order" })
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 2, name: "You cancelled" })
      ).toBeTruthy()
    );
    const post = calls.find((call) => call.path.endsWith("/cancel"))!;
    expect(JSON.parse(String(post.init?.body))).toEqual({ as: "buyer" });
    expect(store.getState().wallet.wallet?.available).toBe(30_860);
    expect(store.getState().ui.toasts.map((toast) => toast.message)).toEqual([
      "Order #K7Q2 cancelled · 6.50 credits refunded",
    ]);
    expect(screen.queryByRole("button", { name: "Cancel order" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Refund" }).getAttribute("href")
    ).toBe("/wallet/transactions/refund-order-abc-1");
    // Said by the toast and the headline, not the live region too.
    expect(liveRegion().textContent).toBe("");
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { level: 2, name: "You cancelled" })
      )
    );
  });

  it("after delivery offers Order again and Tweet about it", async () => {
    const delivered = order({}, { now: at(30) });
    const { store, router } = setup({ initial: delivered, serverNow: iso(30) });
    expect(screen.queryByRole("button", { name: "Cancel order" })).toBeNull();

    await userEvent.click(
      screen.getByRole("button", { name: "Tweet about it" })
    );
    expect(store.getState().ui.composeOpen).toBe(true);
    expect(store.getState().ui.composePrefill).toEqual(tweetAboutIt(delivered));

    await userEvent.click(screen.getByRole("button", { name: "Order again" }));
    expect(store.getState().cart).toMatchObject({
      business: { username: "kizilaykahve", fullname: "Kızılay Kahve" },
      lines: [
        {
          productId: "seed-p-kk-latte",
          name: "Pistachio latte",
          unitPrice: 500,
          quantity: 1,
        },
      ],
    });
    expect(router.push).toHaveBeenCalledWith("/checkout");
    expect(
      screen
        .getByRole("link", { name: "Paid from wallet" })
        .getAttribute("href")
    ).toBe("/wallet/transactions/order-abc-1");
  });

  it("gives the business Cancel & refund, and nothing on a read-only demo", () => {
    setup({ side: "business" });
    expect(
      screen.getByRole("button", { name: "Cancel & refund" })
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Paid from wallet" })).toBeNull();
    cleanup();

    setup({ readOnly: true });
    expect(screen.queryByRole("button", { name: "Cancel order" })).toBeNull();
  });
});
