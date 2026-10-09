// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import type { GetServerSidePropsContext } from "next";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { Provider } from "react-redux";
import { afterEach, describe, expect, it, vi } from "vitest";

import { freshApi } from "../../test/api";
import { featuresWith, mockRouter, testViewer } from "../../test/render";
import { sessionState } from "../../slices/sessionSlice";
import { walletUiState } from "../../slices/walletUiSlice";
import { makeStore } from "../../store";
import Wallet from "../../pages/wallet/index";
import { marco, paymentRequest, transfer, walletState } from "./testing";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const context = {
  params: {},
  query: {},
} as unknown as GetServerSidePropsContext;

async function serverProps() {
  const page = await import("../../pages/wallet/index");
  const result = await page.getServerSideProps(context);
  if (!("props" in result)) throw new Error("expected props");
  return await result.props;
}

describe("/wallet on the server", () => {
  it("reads the activity and the requests into the store", async () => {
    await freshApi({ world: "superapp" });
    const props = await serverProps();

    expect(props.activity.items.length).toBeGreaterThan(0);
    const requests = props.initialState.walletUi?.requests;
    expect(requests?.status).toBe("loaded");
    // The foundation's seed: three people ask the demo user; they asked Ayşe (paid).
    expect(requests?.incoming.map((r) => r.id)).toEqual(
      expect.arrayContaining(["seed-req01", "seed-req03", "seed-req04"])
    );
    expect(requests?.incoming.every((r) => r.status === "pending")).toBe(true);
    expect(requests?.outgoing.map((r) => r.id)).toContain("seed-req02");
  });

  it("still renders when the requests can't be read", async () => {
    await freshApi({ world: "superapp" });
    const { getRepository } = await import("../../lib/db");
    vi.spyOn(getRepository().wallet, "listRequests").mockRejectedValue(
      new Error("Sanity is down")
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const props = await serverProps();
    expect(props.activity.items.length).toBeGreaterThan(0);
    expect(props.initialState.walletUi?.requests.status).toBe("failed");
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe("/wallet", () => {
  function renderPage(query: Record<string, string> = {}) {
    const store = makeStore({
      session: sessionState({
        viewer: testViewer,
        readOnly: false,
        features: featuresWith("wallet"),
      }),
      wallet: walletState(),
      walletUi: walletUiState({
        incoming: [paymentRequest()],
        outgoing: [
          paymentRequest({
            id: "req-out",
            requester: testViewer,
            payer: marco,
          }),
        ],
      }),
    });
    const search = new URLSearchParams(query).toString();
    const router = mockRouter({
      asPath: `/wallet${search ? `?${search}` : ""}`,
      query,
    });
    render(
      <RouterContext.Provider value={router}>
        <Provider store={store}>
          <Wallet
            activity={{
              items: [transfer({ createdAt: "2026-10-09T11:00:00.000Z" })],
              nextCursor: null,
            }}
            serverNow="2026-10-09T12:00:00.000Z"
          />
        </Provider>
      </RouterContext.Provider>
    );
  }

  const tabs = () => screen.getByRole("navigation", { name: "Wallet history" });

  it("shows the actions, requests for you and the Activity tab", () => {
    renderPage();
    const balance = screen.getByRole("region", { name: "Balance" });
    expect(
      within(balance)
        .getAllByRole("button")
        .map((button) => button.textContent)
    ).toEqual(["Send", "Request", "Add credits"]);
    expect(
      screen.getByRole("region", { name: "Requests for you" })
    ).toBeTruthy();

    expect(
      within(tabs())
        .getByRole("link", { name: "Activity" })
        .getAttribute("aria-current")
    ).toBe("page");
    expect(screen.getByRole("region", { name: "Activity" })).toBeTruthy();
    // The other tab stays mounted, hidden.
    expect(screen.queryByRole("region", { name: "Your requests" })).toBeNull();
  });

  it("opens on the Requests tab with ?tab=requests", () => {
    renderPage({ tab: "requests" });
    const link = within(tabs()).getByRole("link", { name: "Requests" });
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(link.getAttribute("href")).toBe("/wallet?tab=requests");
    const panel = screen.getByRole("region", { name: "Your requests" });
    expect(panel.textContent).toContain(
      "You requested 4.50 credits from Marco Rossi"
    );
    expect(screen.queryByRole("region", { name: "Activity" })).toBeNull();
  });
});
