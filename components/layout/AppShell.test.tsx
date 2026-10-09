// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { initialActivityState } from "../../slices/activitySlice";
import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { ILiveActivity } from "../../types/Superapp";
import { PageShell } from "../../types/PageShell";
import AppShell from "./AppShell";

const WALLET = {
  username: testViewer.username,
  balance: 1_000,
  pending: 0,
  available: 1_000,
  frozen: false,
};

/** Answers the shell's own requests and records them. */
function stubApi(live: ILiveActivity[] = []) {
  const fetch = vi.fn(async (path: string) => {
    if (path.startsWith("/api/activity")) {
      return Response.json({
        serverNow: new Date().toISOString(),
        unreadConversations: 0,
        newNotifications: 2,
        live,
      });
    }
    if (path === "/api/wallet") {
      return Response.json({
        wallet: WALLET,
        limits: null,
        serverNow: new Date().toISOString(),
      });
    }
    return Response.json({ items: [] });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function renderShell(
  shell?: PageShell,
  { walletLoaded = true, activityLoaded = true } = {}
) {
  return renderWithStore(
    <AppShell shell={shell}>
      <h1>Page</h1>
    </AppShell>,
    {
      state: {
        session: sessionState({
          viewer: testViewer,
          readOnly: false,
          features: featuresWith("wallet"),
        }),
        trends: { items: [], loaded: true, loading: false },
        wallet: {
          wallet: walletLoaded ? WALLET : null,
          limits: null,
          loaded: walletLoaded,
        },
        activity: { ...initialActivityState, loaded: activityLoaded },
      },
    }
  );
}

const requested = (fetch: ReturnType<typeof stubApi>) =>
  fetch.mock.calls.map(([path]) => path);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("AppShell layout", () => {
  it("has a 600px main column and the right column from 1024px by default", () => {
    stubApi();
    renderShell();
    const main = screen.getByRole("main");
    expect(main.className).toContain("max-w-feed");
    expect(main.className).not.toContain("lg:max-w-[990px]");
    expect(
      screen.getByRole("complementary", { hidden: true }).className
    ).toContain("lg:block");
    expect(screen.getAllByRole("navigation", { name: "Primary" })).toHaveLength(
      2
    );
    expect(
      screen.getByRole("button", { name: "Compose a Tweet" })
    ).toBeTruthy();
  });

  it("grows main to 990px and drops the right column on wide pages", () => {
    stubApi();
    renderShell({ layout: "wide" });
    expect(screen.getByRole("main").className).toContain("lg:max-w-[990px]");
    expect(
      screen.getByRole("complementary", { hidden: true }).className
    ).not.toContain("lg:block");
  });

  it("hides the tab bar (focus mode) and the compose button on request", () => {
    stubApi();
    renderShell({ hideMobileNav: true, hideComposeButton: true });
    // Only the sidebar's navigation is left.
    expect(screen.getAllByRole("navigation", { name: "Primary" })).toHaveLength(
      1
    );
    expect(
      screen.queryByRole("button", { name: "Compose a Tweet" })
    ).toBeNull();
  });
});

describe("AppShell data", () => {
  it("recounts the bell right away when the page came from the server", async () => {
    const fetch = stubApi();
    const { store } = renderShell(undefined, { activityLoaded: false });
    await waitFor(() =>
      expect(
        requested(fetch).some((path) => path.startsWith("/api/activity"))
      ).toBe(true)
    );
    await waitFor(() => expect(store.getState().activity.loaded).toBe(true));
    expect(store.getState().activity.newNotifications).toBe(2);
  });

  it("loads the wallet where the server didn't (404 and 500 pages)", async () => {
    const fetch = stubApi();
    const { store } = renderShell(undefined, { walletLoaded: false });
    await waitFor(() => expect(store.getState().wallet.loaded).toBe(true));
    expect(requested(fetch)).toContain("/api/wallet");
  });

  it("polls early when a live item is due to change", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const soon = new Date(Date.now() + 5_000).toISOString();
    const fetch = stubApi([
      {
        kind: "ride",
        id: "r1",
        title: "Ride to Atakule",
        status: "Ahmet is 3 min away",
        eta: null,
        href: "/rides/r1",
        nextChangeAt: soon,
      },
    ]);
    renderShell(undefined, { activityLoaded: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const polls = () =>
      requested(fetch).filter((path) => path.startsWith("/api/activity"))
        .length;
    expect(polls()).toBe(1);

    // Long before the 30 s poll: at nextChangeAt (plus a little).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(polls()).toBe(2);
  });
});
