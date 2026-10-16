// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IDEMPOTENCY_KEY_PATTERN } from "../../lib/superapp/idempotency";
import { rideActivity } from "../../lib/superapp/rides";
import { initialActivityState } from "../../slices/activitySlice";
import { rideReceived, ridesState } from "../../slices/ridesSlice";
import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { IRide } from "../../types/Ride";
import { IAuthor } from "../../types/User";
import { ITransfer, IWallet } from "../../types/Wallet";
import RideView from "./RideView";
import { ahmet, cancelledFields, rideAfter } from "./testFixtures";

const wallet = (available: number): IWallet => ({
  username: testViewer.username,
  balance: available,
  pending: 0,
  available,
  frozen: false,
});

const driverAuthor: IAuthor = {
  username: ahmet.username,
  fullname: ahmet.fullname,
  image: null,
};

interface Call {
  path: string;
  method: string;
  key: string | null;
  body: unknown;
}

/** Answers POSTs by path with `answers[path]` and records every call. */
function stubApi(answers: Record<string, () => Response> = {}) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init: RequestInit = {}) => {
      const headers = (init.headers ?? {}) as Record<string, string>;
      calls.push({
        path,
        method: init.method ?? "GET",
        key: headers["Idempotency-Key"] ?? null,
        body: init.body ? JSON.parse(String(init.body)) : null,
      });
      if (answers[path]) return answers[path]();
      if (path.startsWith("/api/activity")) {
        return Response.json({
          serverNow: new Date().toISOString(),
          unreadConversations: 0,
          newNotifications: 0,
          live: [],
        });
      }
      return Response.json(
        { error: { code: "not_found", message: "Not found" } },
        { status: 404 }
      );
    })
  );
  return calls;
}

function renderRide(
  { ride, serverNow }: { ride: IRide; serverNow: string },
  {
    viewer = testViewer,
    readOnly = false,
    live = false,
  }: {
    viewer?: IAuthor;
    readOnly?: boolean;
    /** The ride is in the shell's live activity (the rider's ride in progress). */
    live?: boolean;
  } = {}
) {
  return renderWithStore(<RideView id={ride.id} />, {
    path: `/rides/${ride.id}`,
    state: {
      session: sessionState({
        viewer,
        readOnly,
        features: featuresWith("wallet", "rides"),
      }),
      wallet: { wallet: wallet(30_860), limits: null, loaded: true },
      rides: ridesState(ride, serverNow),
      activity: {
        ...initialActivityState,
        live: live ? [rideActivity(ride)] : [],
      },
    },
  });
}

/** RideStatus's polite region, where the page says a new stage. */
const stageRegion = () =>
  within(
    document.getElementById("ride-status-ride-test1")!.parentElement!
  ).getByRole("status");

/** Puts a newer read of the ride in the store, as a poll would. */
const polled = (
  store: ReturnType<typeof renderRide>["store"],
  ride: ReturnType<typeof rideAfter>
) =>
  act(() => {
    store.dispatch(
      rideReceived({ ride: ride.ride, serverNow: ride.serverNow })
    );
  });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RideView", () => {
  it("shows the car on its way, the driver and the trip, with Cancel ride", () => {
    stubApi();
    renderRide(rideAfter(60));

    expect(
      screen.getByRole("img", { name: "Map from Kızılay to Atakule, 5.1 km" })
    ).toBeTruthy();
    expect(screen.getByTestId("map-car")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "Ahmet is 2 min away" })
    ).toBeTruthy();
    expect(screen.getByText("White Toyota Corolla")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Trip" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel ride" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /^Tip/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Book again" })).toBeNull();
  });

  it("hides the driver until one is assigned", () => {
    stubApi();
    renderRide(rideAfter(1));
    expect(
      screen.getByRole("heading", { level: 2, name: "Finding your driver…" })
    ).toBeTruthy();
    expect(screen.queryByText("White Toyota Corolla")).toBeNull();
    expect(screen.queryByTestId("map-car")).toBeNull();
  });

  it("shows no driver for a ride cancelled before one was matched", () => {
    stubApi();
    renderRide(rideAfter(30, cancelledFields(5)));
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Ride cancelled · refunded",
      })
    ).toBeTruthy();
    expect(screen.queryByText("White Toyota Corolla")).toBeNull();

    cleanup();
    renderRide(rideAfter(30, cancelledFields(20)));
    expect(screen.getByText("White Toyota Corolla")).toBeTruthy();
  });

  it("cancels after a confirm, shows the refund and moves focus to the status", async () => {
    const cancelled = rideAfter(70, cancelledFields(70));
    const calls = stubApi({
      "/api/rides/ride-test1/cancel": () =>
        Response.json({
          ride: cancelled.ride,
          wallet: wallet(30_860),
          serverNow: cancelled.serverNow,
        }),
    });
    const { store } = renderRide(rideAfter(60));
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Cancel ride" }));
    const dialog = screen.getByRole("dialog", { name: "Cancel this ride?" });
    expect(dialog.textContent).toContain(
      "You’ll get your 6.30 credits back right away."
    );
    await user.click(
      within(dialog).getByRole("button", {
        name: "Cancel ride and refund 6.30 credits",
      })
    );

    const heading = await screen.findByRole("heading", {
      level: 2,
      name: "Ride cancelled · refunded",
    });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    // The focused headline and the toast say it: the region stays quiet.
    expect(stageRegion().textContent).toBe("");
    const cancel = calls.find((call) => call.path.endsWith("/cancel"))!;
    expect(cancel.method).toBe("POST");
    // Cancelling is idempotent by state: no key.
    expect(cancel.key).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel ride" })).toBeNull();
    expect(screen.getByRole("link", { name: "Refund receipt" })).toBeTruthy();
    expect(store.getState().ui.toasts.map((toast) => toast.message)).toEqual([
      "Ride cancelled · 6.30 credits refunded",
    ]);
  });

  it("explains a cancel that came too late", async () => {
    stubApi({
      "/api/rides/ride-test1/cancel": () =>
        Response.json(
          {
            error: {
              code: "invalid_state",
              message:
                "The driver has picked you up, so this ride can't be cancelled",
            },
          },
          { status: 409 }
        ),
    });
    renderRide(rideAfter(60));
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Cancel ride" }));
    await user.click(
      screen.getByRole("button", { name: /^Cancel ride and refund/ })
    );
    expect((await screen.findByRole("alert")).textContent).toBe(
      "The driver has picked you up, so this ride can't be cancelled"
    );
  });

  it("moves focus to the headline when the dialog closes after pickup took Cancel ride away", async () => {
    stubApi();
    const { store } = renderRide(rideAfter(170));
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Cancel ride" }));
    const dialog = screen.getByRole("dialog", {
      name: "Cancel this ride?",
    }) as HTMLDialogElement;
    // Pickup passes while the dialog is open: its button goes away.
    polled(store, rideAfter(185));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Cancel ride" })).toBeNull()
    );
    expect(dialog.open).toBe(true);

    // Esc: the browser can't put focus back on a button that is gone.
    act(() => dialog.close());
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 2, name: /^On the way to Atakule/ })
    );
  });

  it("after the ride: the receipt, tips reviewed in PaymentConfirm, and Book again", async () => {
    const tip: ITransfer = {
      id: "tx-tip-1",
      kind: "tip",
      amount: 200,
      from: testViewer,
      to: driverAuthor,
      note: null,
      context: { type: "ride", id: "ride-test1", code: "R7K2" },
      createdAt: "2026-10-09T14:12:00.000Z",
      holdUntil: null,
      reversedBy: null,
      reverses: null,
    };
    const calls = stubApi({
      "/api/rides/ride-test1/tip": () =>
        Response.json(
          { transfer: tip, wallet: wallet(30_660) },
          { status: 201 }
        ),
    });
    const { store } = renderRide(rideAfter(700));
    const user = userEvent.setup();

    expect(screen.getByRole("heading", { name: "Receipt" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Payment receipt" }).getAttribute("href")
    ).toBe("/wallet/transactions/ride-test1-1");
    expect(
      screen.getByRole("link", { name: "Book again" }).getAttribute("href")
    ).toBe("/rides?from=kizilay&to=atakule");
    expect(screen.queryByRole("button", { name: "Cancel ride" })).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Tip Ahmet 2.00 credits" })
    );
    const dialog = screen.getByRole("dialog", { name: "Tip Ahmet" });
    const confirm = within(dialog).getByRole("button", {
      name: "Tip 2.00 credits to Ahmet Kaya",
    });
    expect(document.activeElement).toBe(confirm);
    await user.click(confirm);

    await waitFor(() =>
      expect(store.getState().wallet.wallet?.available).toBe(30_660)
    );
    const post = calls.find((call) => call.path.endsWith("/tip"))!;
    expect(post.body).toEqual({ amount: 200 });
    expect(post.key).toMatch(IDEMPOTENCY_KEY_PATTERN);
    expect(store.getState().ui.toasts).toEqual([
      expect.objectContaining({
        message: "You tipped Ahmet 2.00 credits",
        action: { label: "Receipt", href: "/wallet/transactions/tx-tip-1" },
      }),
    ]);
    expect(
      screen.getByText("Thanks! You tipped Ahmet 2.00 credits.")
    ).toBeTruthy();
  });

  it("is read-only for the driver: no cancel, tips or booking", () => {
    stubApi();
    renderRide(rideAfter(60), { viewer: driverAuthor });

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Pick up Ilhan at Kızılay in 2 min",
      })
    ).toBeTruthy();
    expect(screen.getByText("Ilhan Ozkan")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel ride" })).toBeNull();
    expect(screen.queryByText("White Toyota Corolla")).toBeNull();
  });

  it("offers no actions on a read-only demo", () => {
    stubApi();
    renderRide(rideAfter(700), { readOnly: true });
    expect(
      screen.getByText(
        "Booking, cancelling and tips are turned off on this read-only demo."
      )
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /^Tip/ })).toBeNull();
  });
});

describe("RideView announcements", () => {
  it("leaves a live ride's pickup and trip to the shell's announcer, and says its arrival", async () => {
    stubApi();
    const { store } = renderRide(rideAfter(5), { live: true });
    expect(stageRegion().textContent).toBe("");

    // The shell says "Ride to Atakule: Ahmet is on the way".
    polled(store, rideAfter(15));
    await screen.findByRole("heading", {
      level: 2,
      name: "Ahmet is 3 min away",
    });
    expect(stageRegion().textContent).toBe("");

    // "Ride to Atakule: On the way to Atakule"
    polled(store, rideAfter(200));
    await screen.findByRole("heading", {
      level: 2,
      name: /^On the way to Atakule/,
    });
    expect(stageRegion().textContent).toBe("");

    // A finished ride leaves the live activity: only the page can say it.
    polled(store, rideAfter(700));
    await screen.findByRole("heading", { level: 2, name: "You’ve arrived" });
    expect(stageRegion().textContent).toBe("You’ve arrived at Atakule");
  });

  it("says each stage of a ride the shell doesn't announce", async () => {
    stubApi();
    const { store } = renderRide(rideAfter(5));

    polled(store, rideAfter(15));
    await screen.findByRole("heading", {
      level: 2,
      name: "Ahmet is 3 min away",
    });
    expect(stageRegion().textContent).toBe(
      "Ahmet is on the way to pick you up"
    );
  });

  it("says a cancel made elsewhere", async () => {
    stubApi();
    const { store } = renderRide(rideAfter(60), { live: true });

    polled(store, rideAfter(70, cancelledFields(70)));
    await screen.findByRole("heading", {
      level: 2,
      name: "Ride cancelled · refunded",
    });
    expect(stageRegion().textContent).toBe(
      "Ride cancelled. Your fare was refunded"
    );
  });
});
