// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toLiveActivity } from "../../lib/db/orders/views";
import { getPlace } from "../../lib/superapp/places";
import { initialActivityState } from "../../slices/activitySlice";
import { ordersState } from "../../slices/ordersSlice";
import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { IOrder } from "../../types/Order";
import { stubFetch } from "../shop/testing";
import AppShell from "../layout/AppShell";
import { clockText, inProgress, tweetAboutIt } from "./format";
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
  inShell = false,
}: {
  initial?: IOrder;
  serverNow?: string;
  side?: "buyer" | "business";
  readOnly?: boolean;
  inLiveActivity?: boolean;
  /** Inside the app's shell, whose announcer polls the live activity. */
  inShell?: boolean;
} = {}) {
  // When the tracker asked, in seconds after T0.
  const polledAt: number[] = [];
  const api = stubFetch({
    // The order as the (fake) clock has it now.
    "/api/orders/order-abc": () => {
      polledAt.push((Date.now() - at(0).getTime()) / 1000);
      return [
        200,
        {
          order: order({}, { now: new Date() }),
          serverNow: new Date().toISOString(),
        },
      ];
    },
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
    // The order in the buyer's live activity while it is on its way.
    "/api/activity": () => {
      const now = order({}, { now: new Date() });
      return [
        200,
        {
          serverNow: inLiveActivity ? new Date().toISOString() : iso(4),
          unreadConversations: 0,
          newNotifications: 0,
          live: inLiveActivity && inProgress(now) ? [toLiveActivity(now)] : [],
        },
      ];
    },
  });
  vi.stubGlobal("fetch", vi.fn(api.fetch));
  const tracker = (
    <OrderTracker
      initial={{ order: initial, serverNow }}
      from={kizilay}
      side={side}
    />
  );
  const result = renderWithStore(
    inShell ? <AppShell>{tracker}</AppShell> : tracker,
    {
      path: "/orders/order-abc",
      state: {
        session: sessionState({
          viewer: testViewer,
          readOnly,
          features: featuresWith("wallet", "shop", "orders"),
        }),
        trends: { items: [], loaded: true, loading: false },
        wallet: { wallet: wallet(30_210), limits: null, loaded: true },
        orders: ordersState([initial], serverNow),
        activity: {
          ...initialActivityState,
          live: inLiveActivity ? [toLiveActivity(initial)] : [],
        },
      },
    }
  );
  return { ...result, calls: api.calls, polledAt };
}

/** The tracker's own polite region. */
const liveRegion = () =>
  document.querySelector<HTMLElement>('section > p[aria-live="polite"]')!;
/** The shell's, which reads out live activity changes. */
const shellRegion = () =>
  document.querySelector<HTMLElement>('body > div > p[aria-live="polite"]')!;
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

  /** What a live region says, second by second, until `seconds`. */
  async function listen(seconds: number, region = liveRegion) {
    const heard: string[] = [];
    for (let second = 1; second < seconds; second++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      const text = region().textContent ?? "";
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

  it("asks again just after each stage is due, whatever the tick's phase", async () => {
    // Stages fall on whole seconds after placedAt (15, 18 and 24 s), so the
    // once-a-second tick that moves past one lands at the same fraction of
    // a second after each. Under 500 ms, it must not cancel the poll due
    // then. Renders happen when an act() ends: 100 ms steps keep them
    // close to the timers that cause them.
    for (const phase of [100, 400, 700]) {
      const mounted = new Date(at(1).getTime() + phase);
      vi.setSystemTime(mounted);
      const { polledAt } = setup({ serverNow: mounted.toISOString() });
      for (let step = 0; step < 300; step++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(100);
        });
      }
      for (const due of [15, 18, 24]) {
        expect(
          polledAt.some((time) => time >= due + 0.5 && time < due + 0.6),
          `phase ${phase} ms: a poll at ${due + 0.5} s in ${polledAt}`
        ).toBe(true);
      }
      cleanup();
    }
  });

  it("says every stage once on its own page, leaving the shell quiet", async () => {
    const { calls } = setup({ inLiveActivity: true, inShell: true });
    const shell: string[] = [];
    const page = await listen(40, () => {
      const text = shellRegion().textContent ?? "";
      if (text) shell.push(text);
      return liveRegion();
    });
    const eta = clockText(order().deliverAt);
    expect(page).toEqual([
      `Accepted · Arrives around ${eta}`,
      `On the way · Arrives around ${eta}`,
      `Delivered at ${eta}`,
    ]);
    expect(shell).toEqual([]);
    // The shell did see the changes: it polled at each one.
    expect(
      calls.filter((call) => call.path.startsWith("/api/activity")).length
    ).toBeGreaterThan(2);
  });

  it("is said by the shell on other pages", async () => {
    const api = stubFetch({
      "/api/activity": () => {
        const now = order({}, { now: new Date() });
        return [
          200,
          {
            serverNow: new Date().toISOString(),
            unreadConversations: 0,
            newNotifications: 0,
            live: inProgress(now) ? [toLiveActivity(now)] : [],
          },
        ];
      },
    });
    vi.stubGlobal("fetch", vi.fn(api.fetch));
    renderWithStore(
      <AppShell>
        <h1>Services</h1>
      </AppShell>,
      {
        path: "/services",
        state: {
          session: sessionState({
            viewer: testViewer,
            readOnly: false,
            features: featuresWith("wallet", "shop", "orders"),
          }),
          trends: { items: [], loaded: true, loading: false },
          wallet: { wallet: wallet(30_210), limits: null, loaded: true },
          activity: {
            ...initialActivityState,
            live: [toLiveActivity(order())],
          },
        },
      }
    );
    expect(await listen(40, shellRegion)).toEqual([
      "Order from Kızılay Kahve: Accepted",
      "Order from Kızılay Kahve: On the way",
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
