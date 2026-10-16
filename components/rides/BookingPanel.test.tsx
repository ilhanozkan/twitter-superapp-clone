// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IDEMPOTENCY_KEY_PATTERN } from "../../lib/superapp/idempotency";
import { rideQuotes } from "../../lib/superapp/rides";
import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { RideType } from "../../types/Ride";
import { IWallet } from "../../types/Wallet";
import BookingPanel from "./BookingPanel";
import { rideAfter } from "./testFixtures";

const wallet = (available: number): IWallet => ({
  username: testViewer.username,
  balance: available,
  pending: 0,
  available,
  frozen: false,
});

/** Kızılay → Atakule: economy 6.30, comfort 8.90, xl 11.10. */
const quote = (...unavailable: RideType[]) =>
  rideQuotes("kizilay", "atakule", (type) => !unavailable.includes(type));

interface Call {
  path: string;
  method: string;
  key: string | null;
  body: unknown;
}

/** Answers POST /api/rides with `answers` in turn (a Response each) and records calls. */
function stubApi(answers: (() => Response)[] = []) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (path: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({
      path,
      method: init.method ?? "GET",
      key: headers["Idempotency-Key"] ?? null,
      body: init.body ? JSON.parse(String(init.body)) : null,
    });
    if (path === "/api/rides" && init.method === "POST") {
      const answer = answers.shift();
      if (answer) return answer();
    }
    if (path.startsWith("/api/activity")) {
      return Response.json({
        serverNow: new Date().toISOString(),
        unreadConversations: 0,
        newNotifications: 0,
        live: [],
      });
    }
    return Response.json(
      { error: { code: "not_found", message: "?" } },
      {
        status: 404,
      }
    );
  });
  vi.stubGlobal("fetch", fetch);
  return calls;
}

const booked = () => {
  const { ride, serverNow } = rideAfter(0);
  return Response.json(
    { ride, wallet: wallet(30_230), serverNow },
    { status: 201 }
  );
};

const failure = (status: number, code: string, message: string) => () =>
  Response.json({ error: { code, message } }, { status });

function renderPanel({
  available = 30_860,
  readOnly = false,
  unavailable = [] as RideType[],
} = {}) {
  const onRouteChange = vi.fn();
  const onRefreshQuote = vi.fn(async () => {});
  const result = renderWithStore(
    <BookingPanel
      route={{ from: "kizilay", to: "atakule" }}
      onRouteChange={onRouteChange}
      quote={quote(...unavailable)}
      onRefreshQuote={onRefreshQuote}
      recentDestinations={["atakule", "kizilay", "esenboga"]}
    />,
    {
      path: "/rides",
      state: {
        session: sessionState({
          viewer: testViewer,
          readOnly,
          features: featuresWith("wallet", "rides"),
        }),
        wallet: { wallet: wallet(available), limits: null, loaded: true },
      },
    }
  );
  return { ...result, onRouteChange, onRefreshQuote };
}

const bookButton = (name: RegExp | string = /^Book /) =>
  screen.getByRole("button", { name });

const posts = (calls: Call[]) =>
  calls.filter((call) => call.path === "/api/rides");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BookingPanel", () => {
  it("reviews the payment: available credits, what is left, and the fare on the button", () => {
    renderPanel();
    expect(bookButton().textContent).toBe("Book Economy · 6.30 credits");
    expect(screen.getByText("308.60 credits")).toBeTruthy();
    expect(screen.getByText("302.30 credits")).toBeTruthy();
    expect(screen.getByText("Demo")).toBeTruthy();
  });

  it("books with the quoted fare and a key, then opens the ride", async () => {
    const calls = stubApi([booked]);
    const { router, store } = renderPanel();

    await userEvent.setup().click(bookButton("Book Economy · 6.30 credits"));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/rides/ride-test1")
    );
    const [post] = posts(calls);
    expect(post.method).toBe("POST");
    expect(post.body).toEqual({
      from: "kizilay",
      to: "atakule",
      type: "economy",
      expectedFare: 630,
    });
    expect(post.key).toMatch(IDEMPOTENCY_KEY_PATTERN);
    // Money is never optimistic: the wallet is the server's.
    expect(store.getState().wallet.wallet?.available).toBe(30_230);
    expect(store.getState().rides.byId["ride-test1"]).toBeTruthy();
  });

  it("retries a failed booking with the same key, and uses a new one for another ride", async () => {
    const calls = stubApi([
      failure(503, "unavailable_service", "Try again in a moment."),
      failure(503, "unavailable_service", "Try again in a moment."),
      booked,
    ]);
    const { router } = renderPanel();
    const user = userEvent.setup();

    await user.click(bookButton());
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Try again in a moment."
    );
    await user.click(bookButton());
    await waitFor(() => expect(posts(calls)).toHaveLength(2));
    expect(posts(calls)[1].key).toBe(posts(calls)[0].key);

    await user.click(screen.getByRole("radio", { name: /^Comfort/ }));
    await user.click(bookButton("Book Comfort · 8.90 credits"));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(posts(calls)[2].key).not.toBe(posts(calls)[0].key);
    expect(posts(calls)[2].body).toMatchObject({
      type: "comfort",
      expectedFare: 890,
    });
  });

  it("explains a changed fare and asks for fresh quotes", async () => {
    stubApi([
      failure(
        409,
        "price_changed",
        "The fare changed. Check the new price and book again."
      ),
    ]);
    const { onRefreshQuote } = renderPanel();

    await userEvent.setup().click(bookButton());
    expect((await screen.findByRole("alert")).textContent).toContain(
      "The fare changed. Check the new price and book again."
    );
    expect(onRefreshQuote).toHaveBeenCalledTimes(1);
  });

  it("won't book without enough credits, and says how to fix it", async () => {
    const calls = stubApi();
    renderPanel({ available: 300 });

    const button = bookButton();
    expect(button.getAttribute("aria-disabled")).toBe("true");
    const reason = document.getElementById(
      button.getAttribute("aria-describedby")!
    );
    expect(reason?.textContent).toContain(
      "You have 3.00 credits available. Add credits to book this ride."
    );
    expect(
      screen.getByRole("link", { name: "Add credits" }).getAttribute("href")
    ).toBe("/wallet");

    await userEvent.setup().click(button);
    expect(posts(calls)).toHaveLength(0);
  });

  it("is disabled with the reason on a read-only demo", async () => {
    const calls = stubApi();
    renderPanel({ readOnly: true });

    const button = bookButton();
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(
      document.getElementById(button.getAttribute("aria-describedby")!)
        ?.textContent
    ).toBe("Booking is turned off on this read-only demo.");
    await userEvent.setup().click(button);
    expect(posts(calls)).toHaveLength(0);
  });

  it("starts on a type that has a free driver", () => {
    renderPanel({ unavailable: ["economy"] });
    expect(bookButton().textContent).toBe("Book Comfort · 8.90 credits");
    expect(screen.getByText("No drivers nearby")).toBeTruthy();
  });

  it("swaps the places and offers recent destinations other than the pickup", async () => {
    const { onRouteChange } = renderPanel();
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: "Swap pickup and destination" })
    );
    expect(onRouteChange).toHaveBeenLastCalledWith({
      from: "atakule",
      to: "kizilay",
    });

    const chips = within(
      screen.getByRole("group", { name: "Recent destinations" })
    ).getAllByRole("button");
    expect(chips.map((chip) => chip.textContent)).toEqual([
      "Atakule",
      "Esenboğa Airport",
    ]);
    expect(
      screen
        .getByRole("button", { name: "Atakule" })
        .getAttribute("aria-pressed")
    ).toBe("true");
    await user.click(screen.getByRole("button", { name: "Esenboğa Airport" }));
    expect(onRouteChange).toHaveBeenLastCalledWith({
      from: "kizilay",
      to: "esenboga",
    });
  });
});
