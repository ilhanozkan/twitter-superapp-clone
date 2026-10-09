// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { ITransfer, IWallet } from "../../types/Wallet";
import BalanceSummary from "./BalanceSummary";
import FrozenNotice from "./FrozenNotice";
import PlaceSelect from "./PlaceSelect";
import ReadOnlyNotice from "./ReadOnlyNotice";
import StageList from "./StageList";
import TransferList from "./TransferList";
import WalletCard from "./WalletCard";

const wallet = (overrides: Partial<IWallet> = {}): IWallet => ({
  username: testViewer.username,
  balance: 30_860,
  pending: 0,
  available: 30_860,
  frozen: false,
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("WalletCard", () => {
  const renderCard = (features = featuresWith("wallet"), value = wallet()) =>
    renderWithStore(<WalletCard variant="sidebar" />, {
      state: {
        session: sessionState({
          viewer: testViewer,
          readOnly: false,
          features,
        }),
        wallet: { wallet: value, limits: null, loaded: true },
      },
    });

  it("shows the balance as demo credits, linking to the wallet", () => {
    renderCard();
    const card = screen.getByRole("region", { name: "Wallet" });
    expect(within(card).getByText("Demo")).toBeTruthy();
    expect(within(card).getByText("308.60 credits")).toBeTruthy();
    expect(
      within(card).getByRole("link", { name: "Wallet" }).getAttribute("href")
    ).toBe("/wallet");
  });

  it("shows what is pending", () => {
    renderCard(
      featuresWith("wallet"),
      wallet({ pending: 1_500, available: 29_360 })
    );
    expect(
      screen.getByRole("region", { name: "Wallet" }).textContent
    ).toContain("Available 293.60 · Pending 15.00");
  });

  it("is hidden while the wallet is off", () => {
    renderCard(featuresWith());
    expect(screen.queryByRole("region", { name: "Wallet" })).toBeNull();
  });
});

describe("BalanceSummary", () => {
  it("explains pending credits on request", async () => {
    render(
      <BalanceSummary wallet={wallet({ pending: 1_500, available: 29_360 })} />
    );
    expect(screen.getByText("308.60")).toBeTruthy();
    const help = screen.getByRole("button", { name: "About pending credits" });
    const text = screen.getByText(/Pending credits come from orders or rides/);
    expect(text.hidden).toBe(true);

    await userEvent.setup().click(help);
    expect(help.getAttribute("aria-expanded")).toBe("true");
    expect(text.hidden).toBe(false);
  });

  it("has no pending line when nothing is held", () => {
    render(<BalanceSummary wallet={wallet()} />);
    expect(screen.queryByText(/Pending/)).toBeNull();
  });
});

describe("TransferList", () => {
  const transfer = (overrides: Partial<ITransfer>): ITransfer => ({
    id: "tx-1",
    kind: "payment",
    amount: 1_500,
    from: { username: "devmarco", fullname: "Marco Rossi", image: null },
    to: testViewer,
    note: null,
    context: null,
    createdAt: "2026-10-09T11:00:00.000Z",
    holdUntil: null,
    reversedBy: null,
    reverses: null,
    ...overrides,
  });

  it("groups by day and links each row to its receipt, signed from the viewer's side", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-09T12:00:00.000Z"));
    renderWithStore(
      <TransferList
        transfers={[
          transfer({ id: "tx-a" }),
          transfer({
            id: "tx-b",
            kind: "tip",
            amount: 200,
            from: testViewer,
            to: {
              username: "lenaframes",
              fullname: "Lena Hoffmann",
              image: null,
            },
            context: { type: "tweet", id: "seed-t03" },
            createdAt: "2026-10-08T09:00:00.000Z",
          }),
          transfer({
            id: "tx-c",
            kind: "issue",
            from: null,
            amount: 30_000,
            createdAt: "2026-10-02T09:00:00.000Z",
          }),
        ]}
        viewer={testViewer.username}
        serverNow="2026-10-09T12:00:00.000Z"
        hasMore={false}
        loading={false}
        error={null}
        onLoadMore={() => {}}
        empty={<p>No activity yet</p>}
      />
    );

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)
    ).toEqual(["Today", "Yesterday", "Oct 2"]);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/wallet/transactions/tx-a",
      "/wallet/transactions/tx-b",
      "/wallet/transactions/tx-c",
    ]);
    expect(links[0].textContent).toContain("Payment from Marco Rossi");
    expect(links[0].textContent).toContain("received 15.00 credits");
    expect(links[1].textContent).toContain("Tip on @lenaframes's Tweet");
    expect(links[1].textContent).toContain("sent 2.00 credits");
    expect(links[2].textContent).toContain("Added demo credits");
  });

  it("marks held and refunded credits", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-09T12:00:00.000Z"));
    renderWithStore(
      <TransferList
        transfers={[
          transfer({ id: "tx-h", holdUntil: "2026-10-09T13:00:00.000Z" }),
          transfer({
            id: "tx-r",
            holdUntil: "2026-10-09T13:00:00.000Z",
            reversedBy: "tx-x",
          }),
        ]}
        viewer={testViewer.username}
        serverNow="2026-10-09T12:00:00.000Z"
        hasMore={false}
        loading={false}
        error={null}
        onLoadMore={() => {}}
        empty={null}
      />
    );
    const [held, refunded] = screen.getAllByRole("link");
    expect(within(held).getByText("Pending")).toBeTruthy();
    expect(within(refunded).getByText("Refunded")).toBeTruthy();
    expect(within(refunded).queryByText("Pending")).toBeNull();
  });

  describe("on a device whose clock is 4 minutes ahead", () => {
    // Held until 13:00 by the server's clock; the device already says 13:02.
    const serverNow = "2026-10-09T12:58:00.000Z";
    const deviceNow = new Date("2026-10-09T13:02:00.000Z");
    const list = (
      <TransferList
        transfers={[
          transfer({ id: "tx-h", holdUntil: "2026-10-09T13:00:00.000Z" }),
        ]}
        viewer={testViewer.username}
        serverNow={serverNow}
        hasMore={false}
        loading={false}
        error={null}
        onLoadMore={() => {}}
        empty={null}
      />
    );

    it("hydrates the server's Pending chip without a mismatch", () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(serverNow));
      const html = renderToString(list);
      expect(html).toContain("Pending");

      vi.setSystemTime(deviceNow);
      const container = document.createElement("div");
      container.innerHTML = html;
      document.body.appendChild(container);
      const onRecoverableError = vi.fn();
      renderWithStore(list, { container, hydrate: true, onRecoverableError });

      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(within(container).getByText("Pending")).toBeTruthy();
    });

    it("ends the hold when the server's clock reaches it", () => {
      vi.useFakeTimers();
      vi.setSystemTime(deviceNow);
      renderWithStore(list);
      expect(screen.getByText("Pending")).toBeTruthy();

      // 12:59 for the server: still held, although the device says 13:03.
      act(() => vi.advanceTimersByTime(60_000));
      expect(screen.getByText("Pending")).toBeTruthy();

      act(() => vi.advanceTimersByTime(2 * 60_000));
      expect(screen.queryByText("Pending")).toBeNull();
    });
  });

  it("shows the empty state, a Show more fallback and a retry", async () => {
    const onLoadMore = vi.fn();
    const props = {
      viewer: testViewer.username,
      serverNow: "2026-10-09T12:00:00.000Z",
      loading: false,
      onLoadMore,
      empty: <p>No activity yet</p>,
    };
    const { rerender } = renderWithStore(
      <TransferList {...props} transfers={[]} hasMore={false} error={null} />
    );
    expect(screen.getByText("No activity yet")).toBeTruthy();

    rerender(
      <TransferList
        {...props}
        transfers={[transfer({})]}
        hasMore
        error={null}
      />
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Show more" }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(
      <TransferList
        {...props}
        transfers={[transfer({})]}
        hasMore
        error="Offline"
      />
    );
    expect(screen.getByRole("alert").textContent).toContain("Offline");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Retry" }));
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });
});

describe("StageList", () => {
  it("is an ordered list whose current step is the last one reached", () => {
    render(
      <StageList
        stages={[
          {
            status: "placed",
            label: "Placed",
            at: "2026-10-09T14:20:00.000Z",
            reached: true,
          },
          {
            status: "accepted",
            label: "Accepted",
            at: "2026-10-09T14:21:00.000Z",
            reached: true,
          },
          {
            status: "on_the_way",
            label: "On the way",
            at: "2026-10-09T14:24:00.000Z",
            reached: false,
          },
        ]}
      />
    );
    const steps = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(steps.map((step) => step.getAttribute("aria-current"))).toEqual([
      null,
      "step",
      null,
    ]);
    expect(steps[0].textContent).toContain("14:20");
    expect(steps[2].textContent).toContain("expected 14:24");
  });
});

describe("PlaceSelect", () => {
  it("offers the places, leaving out the excluded ones", async () => {
    const onChange = vi.fn();
    render(
      <PlaceSelect
        label="Destination"
        value="atakule"
        onChange={onChange}
        exclude={["kizilay"]}
      />
    );
    const select = screen.getByLabelText("Destination") as HTMLSelectElement;
    const values = Array.from(select.options).map((option) => option.value);
    expect(values).toContain("atakule");
    expect(values).not.toContain("kizilay");

    await userEvent.setup().selectOptions(select, "esenboga");
    expect(onChange).toHaveBeenCalledWith("esenboga");
  });
});

describe("notices", () => {
  it("say why money can't move", () => {
    render(
      <>
        <ReadOnlyNotice />
        <FrozenNotice />
      </>
    );
    expect(
      screen.getByText("Payments are turned off on this read-only demo.")
    ).toBeTruthy();
    expect(screen.getByText(/A moderator froze this wallet/).textContent).toBe(
      "A moderator froze this wallet."
    );
    expect(screen.getByText(/Refunds still reach you/)).toBeTruthy();
  });
});
