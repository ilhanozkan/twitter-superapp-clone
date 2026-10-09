// @vitest-environment jsdom
import { act, cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import { transferCreated } from "../../slices/walletUiSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import ActivityList, { mergeActivity } from "./ActivityList";
import { marco, ok, sarah, stubApi, transfer } from "./testing";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const NOW = "2026-10-09T12:00:00.000Z";

const received = transfer({
  id: "tx-a",
  from: marco,
  to: testViewer,
  amount: 1_500,
  createdAt: "2026-10-09T09:00:00.000Z",
});
const tip = transfer({
  id: "tx-b",
  kind: "tip",
  to: { username: "lenaframes", fullname: "Lena Hoffmann", image: null },
  amount: 200,
  context: { type: "tweet", id: "seed-t03" },
  createdAt: "2026-10-08T20:00:00.000Z",
});
const held = transfer({
  id: "tx-c",
  kind: "order",
  from: sarah,
  to: testViewer,
  amount: 600,
  holdUntil: "2026-10-09T13:00:00.000Z",
  context: { type: "order", id: "order-1", code: "K7Q2" },
  createdAt: "2026-10-06T10:00:00.000Z",
});
const refunded = transfer({
  id: "tx-d",
  kind: "order",
  from: sarah,
  to: testViewer,
  holdUntil: "2026-10-09T13:00:00.000Z",
  reversedBy: "refund-tx-d",
  context: { type: "order", id: "order-2", code: "M2X9" },
  createdAt: "2026-10-06T09:00:00.000Z",
});

function renderActivity(
  items = [received, tip, held, refunded],
  { nextCursor = null as string | null, readOnly = false } = {}
) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  return renderWithStore(
    <ActivityList initial={{ items, nextCursor }} serverNow={NOW} />,
    {
      state: {
        session: sessionState({
          viewer: testViewer,
          readOnly,
          features: featuresWith("wallet"),
        }),
      },
    }
  );
}

const dayHeadings = () =>
  screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

describe("ActivityList", () => {
  it("groups transfers by day, signed and spoken from the viewer's side", () => {
    renderActivity();
    expect(dayHeadings()).toEqual(["Today", "Yesterday", "Oct 6"]);

    const today = screen.getByRole("region", { name: "Today" });
    const row = within(today).getByRole("link");
    expect(row.getAttribute("href")).toBe("/wallet/transactions/tx-a");
    expect(row.textContent).toContain("Payment from Marco Rossi");
    // The sign is visible, the direction is spoken: never colour alone.
    expect(
      within(row).getByText("+15.00 credits").getAttribute("aria-hidden")
    ).toBe("true");
    expect(within(row).getByText("received 15.00 credits").className).toBe(
      "sr-only"
    );

    const yesterday = within(
      screen.getByRole("region", { name: "Yesterday" })
    ).getByRole("link");
    expect(yesterday.textContent).toContain("Tip on @lenaframes's Tweet");
    expect(within(yesterday).getByText("sent 2.00 credits")).toBeTruthy();
  });

  it("marks held credits Pending and reversed ones Refunded", () => {
    renderActivity();
    const [heldRow, refundedRow] = within(
      screen.getByRole("region", { name: "Oct 6" })
    ).getAllByRole("link");
    expect(heldRow.textContent).toContain("Order #K7Q2 · Sarah Chen");
    expect(within(heldRow).getByText("Pending")).toBeTruthy();
    expect(within(refundedRow).getByText("Refunded")).toBeTruthy();
    expect(within(refundedRow).queryByText("Pending")).toBeNull();
  });

  it("puts what this device just did on top, once", () => {
    const { store } = renderActivity();
    const sent = transfer({
      id: "tx-new",
      amount: 1_000,
      createdAt: "2026-10-09T11:59:00.000Z",
    });
    act(() => {
      store.dispatch(transferCreated(sent));
      // The same transfer again (a replay) is not listed twice.
      store.dispatch(transferCreated(sent));
    });

    const links = within(
      screen.getByRole("region", { name: "Today" })
    ).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/wallet/transactions/tx-new",
      "/wallet/transactions/tx-a",
    ]);
  });

  it("loads the next page with Show more", async () => {
    const older = transfer({
      id: "tx-old",
      createdAt: "2026-10-01T09:00:00.000Z",
    });
    const calls = stubApi({
      "GET /api/wallet/activity": ok({ items: [older], nextCursor: null }),
    });
    renderActivity([received], { nextCursor: "cursor-1" });
    vi.useRealTimers();

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Show more" }));
    expect(await screen.findByRole("region", { name: "Oct 1" })).toBeTruthy();
    expect(calls.calls[0].url).toBe(
      "/api/wallet/activity?limit=20&cursor=cursor-1"
    );
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("starts an empty wallet off with Add credits", async () => {
    const { store } = renderActivity([]);
    vi.useRealTimers();
    expect(
      screen.getByText(
        "No activity yet. Add demo credits, then tip a Tweet or pay a friend."
      )
    ).toBeTruthy();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Add credits" }));
    expect(store.getState().ui.dialog).toBe("topUp");
    cleanup();

    renderActivity([], { readOnly: true });
    expect(screen.queryByRole("button", { name: "Add credits" })).toBeNull();
  });
});

describe("mergeActivity", () => {
  it("keeps the server's order and drops repeats", () => {
    const fresh = transfer({
      id: "tx-z",
      createdAt: "2026-10-09T11:59:00.000Z",
    });
    expect(
      mergeActivity([fresh, received], [received, tip]).map((t) => t.id)
    ).toEqual(["tx-z", "tx-a", "tx-b"]);
  });
});
