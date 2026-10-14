// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import { walletUiState } from "../../slices/walletUiSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { IPaymentRequest } from "../../types/Wallet";
import OutgoingRequests from "./OutgoingRequests";
import {
  fail,
  held,
  limits,
  marco,
  ok,
  paymentRequest,
  stubApi,
  transfer,
  wallet,
  walletState,
} from "./testing";
import WalletDialogs from "./WalletDialogs";
import WalletRequests from "./WalletRequests";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const coffee = paymentRequest({ id: "seed-req01" });
const parking = paymentRequest({
  id: "seed-req03",
  requester: marco,
  amount: 300,
  note: "Parking 🅿️",
});
const lunch = paymentRequest({
  id: "req-out",
  requester: testViewer,
  payer: marco,
  amount: 1_200,
  note: "Lunch",
});

function renderRequests(
  ui = <WalletRequests />,
  {
    incoming = [coffee, parking],
    outgoing = [] as IPaymentRequest[],
    readOnly = false,
    failed = false,
    current = wallet(),
  } = {}
) {
  return renderWithStore(ui, {
    state: {
      session: sessionState({
        viewer: testViewer,
        readOnly,
        features: featuresWith("wallet"),
      }),
      wallet: walletState(current),
      walletUi: walletUiState(failed ? null : { incoming, outgoing }),
    },
  });
}

const summary = (id: string) =>
  document.querySelector<HTMLElement>(`[data-request-summary="${id}"]`);

const card = (id: string) =>
  document
    .querySelector(`[data-request-summary="${id}"]`)!
    .closest("article") as HTMLElement;

describe("WalletRequests (requests for you)", () => {
  it("lists who asked for how much, with Pay and Decline", () => {
    renderRequests();
    const section = screen.getByRole("region", { name: "Requests for you" });
    const first = card("seed-req01");
    expect(section.contains(first)).toBe(true);
    expect(first.textContent).toContain(
      "Sarah Chen requested 4.50 credits · Coffee ☕ · "
    );
    expect(
      within(first).getByRole("button", {
        name: "Pay 4.50 credits to Sarah Chen",
      }).textContent
    ).toBe("Pay 4.50");
    expect(
      within(first).getByRole("button", {
        name: "Decline Sarah Chen’s request",
      })
    ).toBeTruthy();
  });

  it("pays through the review sheet, then shows Paid with the receipt", async () => {
    const paid = {
      ...parking,
      status: "paid" as const,
      transferId: "tx-paid",
      respondedAt: "2026-10-09T12:00:00.000Z",
    };
    const after = wallet({ balance: 30_560, available: 30_560 });
    const calls = stubApi({
      "POST /api/wallet/requests/seed-req03/pay": ok({
        request: paid,
        transfer: transfer({
          id: "tx-paid",
          kind: "request",
          to: marco,
          amount: 300,
        }),
        wallet: after,
      }),
    });
    const { store } = renderRequests();
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: "Pay 3.00 credits to Marco Rossi" })
    );
    const sheet = screen.getByRole("dialog", { name: "Pay request" });
    expect(sheet.textContent).toContain("Pay 3.00 credits to Marco Rossi");
    expect(within(sheet).getByText("305.60 credits")).toBeTruthy();

    await user.click(
      within(sheet).getByRole("button", {
        name: "Pay 3.00 credits to Marco Rossi",
      })
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Pay request" })).toBeNull()
    );

    const [post] = calls.to("POST /api/wallet/requests/seed-req03/pay");
    expect(post.key).toBeTruthy();
    const paidCard = card("seed-req03");
    expect(within(paidCard).getByText("Paid")).toBeTruthy();
    expect(
      within(paidCard)
        .getByRole("link", { name: "View receipt" })
        .getAttribute("href")
    ).toBe("/wallet/transactions/tx-paid");
    expect(within(paidCard).queryByRole("button")).toBeNull();
    // Focus lands on the card the Pay button was in.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        paidCard.querySelector("[data-request-summary]")
      )
    );

    const state = store.getState();
    expect(state.wallet.wallet).toEqual(after);
    expect(state.walletUi.created.map((t) => t.id)).toEqual(["tx-paid"]);
    expect(state.ui.toasts.at(-1)).toMatchObject({
      message: "You paid Marco Rossi 3.00 credits",
      action: { label: "Receipt", href: "/wallet/transactions/tx-paid" },
    });
  });

  it("declines, keeping focus on the card", async () => {
    stubApi({
      "POST /api/wallet/requests/seed-req01/decline": ok({
        request: { ...coffee, status: "declined" },
      }),
    });
    const { store } = renderRequests();
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: "Decline Sarah Chen’s request" })
    );
    const declined = card("seed-req01");
    expect(await within(declined).findByText("Declined")).toBeTruthy();
    expect(document.activeElement).toBe(
      declined.querySelector("[data-request-summary]")
    );
    expect(store.getState().ui.toasts.at(-1)?.message).toBe(
      "You declined Sarah Chen’s request"
    );
  });

  it("shows a failed decline inline", async () => {
    stubApi({
      "POST /api/wallet/requests/seed-req01/decline": fail(
        409,
        "invalid_state",
        "This request was already paid"
      ),
    });
    renderRequests();
    const user = userEvent.setup();

    const decline = screen.getByRole("button", {
      name: "Decline Sarah Chen’s request",
    });
    await user.click(decline);
    const alert = await within(card("seed-req01")).findByRole("alert");
    expect(alert.textContent).toBe("This request was already paid");
    expect(decline.getAttribute("aria-describedby")).toContain(alert.id);
  });

  describe("a request answered elsewhere (409 invalid_state)", () => {
    const paidElsewhere = {
      ...coffee,
      status: "paid" as const,
      transferId: "tx-lost",
      respondedAt: "2026-10-09T12:00:00.000Z",
    };
    const conflict = fail(
      409,
      "invalid_state",
      "This request was already paid"
    );
    const current = wallet({ balance: 30_410, available: 30_410 });
    const reread = {
      "GET /api/wallet/requests/seed-req01": ok({ request: paidElsewhere }),
      "GET /api/wallet/transfers/tx-lost": ok({
        transfer: transfer({ id: "tx-lost", kind: "request", amount: 450 }),
      }),
      "GET /api/wallet": ok({
        wallet: current,
        limits: limits(),
        serverNow: new Date().toISOString(),
      }),
    };

    it("closes the pay sheet, and the card, balance and activity catch up", async () => {
      // An earlier attempt went through but its response was lost.
      stubApi({
        ...reread,
        "POST /api/wallet/requests/seed-req01/pay": conflict,
      });
      const { store } = renderRequests();
      const user = userEvent.setup();

      await user.click(
        screen.getByRole("button", { name: "Pay 4.50 credits to Sarah Chen" })
      );
      await user.click(
        within(screen.getByRole("dialog", { name: "Pay request" })).getByRole(
          "button",
          { name: "Pay 4.50 credits to Sarah Chen" }
        )
      );
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "Pay request" })).toBeNull()
      );

      const paidCard = card("seed-req01");
      expect(within(paidCard).getByText("Paid")).toBeTruthy();
      expect(
        within(paidCard)
          .getByRole("link", { name: "View receipt" })
          .getAttribute("href")
      ).toBe("/wallet/transactions/tx-lost");
      expect(within(paidCard).queryByRole("button")).toBeNull();
      await waitFor(() =>
        expect(document.activeElement).toBe(summary("seed-req01"))
      );
      expect(store.getState().ui.toasts.at(-1)?.message).toBe(
        "This request was already paid"
      );
      await waitFor(() =>
        expect(store.getState().wallet.wallet).toEqual(current)
      );
      expect(store.getState().walletUi.created.map((t) => t.id)).toEqual([
        "tx-lost",
      ]);
    });

    it("shows a decline's error on the card it re-read, moving focus to its summary", async () => {
      stubApi({
        ...reread,
        "POST /api/wallet/requests/seed-req01/decline": conflict,
      });
      renderRequests();
      const user = userEvent.setup();

      await user.click(
        screen.getByRole("button", { name: "Decline Sarah Chen’s request" })
      );
      const paidCard = card("seed-req01");
      expect(await within(paidCard).findByText("Paid")).toBeTruthy();
      expect(within(paidCard).queryByRole("button")).toBeNull();
      expect(within(paidCard).getByRole("alert").textContent).toBe(
        "This request was already paid"
      );
      await waitFor(() =>
        expect(document.activeElement).toBe(summary("seed-req01"))
      );
    });
  });

  it("comes back to the review's confirm from Add credits", async () => {
    stubApi({
      "GET /api/wallet": ok({
        wallet: wallet({ balance: 5_100, available: 5_100 }),
        limits: limits({ topUpsLeftToday: 1 }),
        serverNow: new Date().toISOString(),
      }),
      "POST /api/wallet/top-ups": ok(
        {
          transfer: transfer({ id: "tx-top", kind: "issue", from: null }),
          wallet: wallet({ balance: 5_100, available: 5_100 }),
        },
        201
      ),
    });
    renderRequests(
      <>
        <WalletRequests />
        <WalletDialogs />
      </>,
      { current: wallet({ balance: 100, available: 100 }) }
    );
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: "Pay 4.50 credits to Sarah Chen" })
    );
    const sheet = screen.getByRole("dialog", { name: "Pay request" });
    await user.click(
      within(within(sheet).getByRole("alert")).getByRole("button", {
        name: "Add credits",
      })
    );
    await user.click(
      screen.getByRole("button", { name: "Add 50.00 demo credits" })
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Add credits" })).toBeNull()
    );

    // The alert that held Add credits is gone now that 51.00 is enough.
    expect(within(sheet).queryByRole("alert")).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(sheet).getByRole("button", {
          name: "Pay 4.50 credits to Sarah Chen",
        })
      )
    );
  });

  it("disables Pay and Decline on a read-only demo, saying why", () => {
    renderRequests(<WalletRequests />, { readOnly: true });
    const first = card("seed-req01");
    for (const button of within(first).getAllByRole("button")) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
    expect(first.textContent).toContain(
      "Paying and declining are off on this read-only demo."
    );
  });

  it("is hidden when nobody asked", () => {
    renderRequests(<WalletRequests />, { incoming: [] });
    expect(
      screen.queryByRole("region", { name: "Requests for you" })
    ).toBeNull();
  });

  it("says when requests can't be loaded, and retries", async () => {
    const calls = stubApi({
      "GET /api/wallet/requests": (call) =>
        ok({ items: call.url.includes("incoming") ? [coffee] : [] }),
    });
    renderRequests(<WalletRequests />, { failed: true });
    const user = userEvent.setup();

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(
      "Payment requests can’t be loaded right now."
    );
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("region", { name: "Requests for you" })
    ).toBeTruthy();
    expect(calls.to("GET /api/wallet/requests").map((c) => c.url)).toEqual([
      "/api/wallet/requests?role=incoming&status=pending",
      "/api/wallet/requests?role=outgoing",
    ]);
  });

  it("keeps Retry (busy) while retrying, then moves focus to the requests", async () => {
    const incoming = held(ok({ items: [coffee] }));
    const calls = stubApi({
      "GET /api/wallet/requests": (call) =>
        call.url.includes("incoming") ? incoming.reply() : ok({ items: [] }),
    });
    renderRequests(<WalletRequests />, { failed: true });
    const user = userEvent.setup();

    const retry = screen.getByRole("button", { name: "Retry" });
    await user.click(retry);
    expect(retry.isConnected).toBe(true);
    expect(retry.getAttribute("aria-busy")).toBe("true");
    expect(retry.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(retry);
    // A second press while it runs reads nothing more.
    await user.click(retry);
    expect(calls.to("GET /api/wallet/requests")).toHaveLength(2);

    incoming.release();
    const heading = await screen.findByRole("heading", {
      name: "Requests for you",
    });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it("says so when Retry finds nobody waiting, focusing that", async () => {
    stubApi({ "GET /api/wallet/requests": ok({ items: [] }) });
    renderRequests(<WalletRequests />, { failed: true });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    const section = await screen.findByRole("region", {
      name: "Requests for you",
    });
    expect(section.textContent).toContain("Nobody is waiting for you to pay.");
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(section).getByRole("heading", { name: "Requests for you" })
      )
    );
  });

  it("keeps Retry and its focus when the retry fails too", async () => {
    stubApi({
      "GET /api/wallet/requests": fail(500, "internal", "Something broke"),
    });
    const { store } = renderRequests(<WalletRequests />, { failed: true });
    const user = userEvent.setup();

    const retry = screen.getByRole("button", { name: "Retry" });
    await user.click(retry);
    await waitFor(() =>
      expect(store.getState().walletUi.requests.status).toBe("failed")
    );
    expect(retry.isConnected).toBe(true);
    expect(retry.getAttribute("aria-disabled")).toBe("false");
    expect(document.activeElement).toBe(retry);
  });
});

describe("OutgoingRequests (the Requests tab)", () => {
  it("lists the viewer's requests with their status, and Cancel while pending", async () => {
    stubApi({
      "POST /api/wallet/requests/req-out/cancel": ok({
        request: { ...lunch, status: "cancelled" },
      }),
    });
    const paid = paymentRequest({
      id: "req-paid",
      requester: testViewer,
      payer: marco,
      status: "paid",
      transferId: "tx-9",
    });
    renderRequests(<OutgoingRequests />, { outgoing: [lunch, paid] });
    const user = userEvent.setup();

    const pending = card("req-out");
    expect(pending.textContent).toContain(
      "You requested 12.00 credits from Marco Rossi · Lunch"
    );
    expect(within(pending).getByText("Pending")).toBeTruthy();
    expect(
      within(card("req-paid"))
        .getByRole("link", { name: "View receipt" })
        .getAttribute("href")
    ).toBe("/wallet/transactions/tx-9");

    await user.click(
      within(pending).getByRole("button", {
        name: "Cancel your request to Marco Rossi",
      })
    );
    expect(await within(card("req-out")).findByText("Cancelled")).toBeTruthy();
    expect(within(card("req-out")).queryByRole("button")).toBeNull();
  });

  it("disables Cancel on a read-only demo, saying why", () => {
    renderRequests(<OutgoingRequests />, { outgoing: [lunch], readOnly: true });
    const pending = card("req-out");
    expect(
      (
        within(pending).getByRole("button", {
          name: "Cancel your request to Marco Rossi",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(pending.textContent).toContain(
      "Cancelling is off on this read-only demo."
    );
  });

  it("moves focus to the first request once Retry has read them", async () => {
    stubApi({
      "GET /api/wallet/requests": (call) =>
        ok({ items: call.url.includes("outgoing") ? [lunch] : [] }),
    });
    renderRequests(<OutgoingRequests />, { failed: true });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(summary("req-out"))
    );
  });

  it("says there are no requests, offering to ask", async () => {
    const { store } = renderRequests(<OutgoingRequests />);
    const user = userEvent.setup();

    expect(screen.getByText("No requests")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Request credits" }));
    expect(store.getState().ui.dialog).toBe("request");
  });
});
