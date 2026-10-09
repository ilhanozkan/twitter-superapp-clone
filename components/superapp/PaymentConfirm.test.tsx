// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../lib/client/api";
import { IDEMPOTENCY_KEY_PATTERN } from "../../lib/superapp/idempotency";
import { renderWithStore } from "../../test/render";
import PaymentConfirm from "./PaymentConfirm";

const sarah = { username: "sarahcodes", fullname: "Sarah Chen", image: null };

afterEach(() => {
  cleanup();
});

function renderConfirm(
  props: Partial<Parameters<typeof PaymentConfirm>[0]> = {}
) {
  const onConfirm = vi.fn<(key: string) => Promise<void>>(async () => {});
  const onDone = vi.fn();
  renderWithStore(
    <PaymentConfirm
      action="Send"
      payee={sarah}
      amount={1_000}
      note="Coffee ☕"
      available={30_860}
      onConfirm={onConfirm}
      onDone={onDone}
      {...props}
    />
  );
  return { onConfirm: props.onConfirm ?? onConfirm, onDone };
}

const confirmButton = () =>
  screen.getByRole("button", { name: "Send 10.00 credits to Sarah Chen" });

describe("PaymentConfirm", () => {
  it("reviews payee, amount, note and the balance after, with a focused confirm", () => {
    renderConfirm();
    expect(screen.getByText("@sarahcodes")).toBeTruthy();
    expect(screen.getByText("Coffee ☕")).toBeTruthy();
    expect(screen.getByText("308.60 credits")).toBeTruthy();
    expect(screen.getByText("298.60 credits")).toBeTruthy();
    expect(document.activeElement).toBe(confirmButton());
  });

  it("adds a fee to the total", () => {
    renderConfirm({ action: "Pay", amount: 500, fee: 150, note: null });
    expect(
      screen.getByRole("button", { name: "Pay 6.50 credits to Sarah Chen" })
    ).toBeTruthy();
    expect(screen.getByText("Fee")).toBeTruthy();
  });

  it("explains insufficient funds, links to Add credits and won't confirm", async () => {
    const { onConfirm } = renderConfirm({ available: 800 });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(
      "You have 8.00 credits available. Add credits or lower the amount"
    );
    expect(
      screen.getByRole("link", { name: "Add credits" }).getAttribute("href")
    ).toBe("/wallet");
    expect(confirmButton().getAttribute("aria-disabled")).toBe("true");
    expect(confirmButton().getAttribute("aria-describedby")).toBe(alert.id);

    await userEvent.setup().click(confirmButton());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("uses the wallet in the store when no amount available is given", () => {
    renderWithStore(
      <PaymentConfirm
        action="Send"
        payee={sarah}
        amount={1_000}
        onConfirm={async () => {}}
      />,
      {
        state: {
          wallet: {
            wallet: {
              username: "illlhanozkan",
              balance: 900,
              pending: 0,
              available: 900,
              frozen: false,
            },
            limits: null,
            loaded: true,
          },
        },
      }
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "You have 9.00 credits available"
    );
  });

  it("retries with the same key, then drops it after a success", async () => {
    const keys: string[] = [];
    let attempt = 0;
    const onConfirm = vi.fn(async (key: string) => {
      keys.push(key);
      attempt += 1;
      if (attempt === 1) {
        throw new ApiRequestError(
          0,
          "network_error",
          "Check your connection and try again."
        );
      }
    });
    const { onDone } = renderConfirm({ onConfirm });
    const user = userEvent.setup();

    await user.click(confirmButton());
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Check your connection and try again."
    );
    await user.click(confirmButton());
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));

    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[0]).toMatch(IDEMPOTENCY_KEY_PATTERN);

    // A new operation after the success gets a new key.
    await user.click(confirmButton());
    await waitFor(() => expect(keys).toHaveLength(3));
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("offers Add credits when the server says the funds are short", async () => {
    renderConfirm({
      onConfirm: async () => {
        throw new ApiRequestError(
          402,
          "insufficient_funds",
          "You don't have enough credits"
        );
      },
    });
    await userEvent.setup().click(confirmButton());
    expect((await screen.findByRole("alert")).textContent).toContain(
      "You don't have enough credits"
    );
    expect(screen.getByRole("link", { name: "Add credits" })).toBeTruthy();
  });

  it("waits for the server: the button is busy, never optimistic", async () => {
    let finish: () => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const { onDone } = renderConfirm({ onConfirm });
    const user = userEvent.setup();

    await user.click(confirmButton());
    expect(confirmButton().getAttribute("aria-busy")).toBe("true");
    await user.click(confirmButton());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();

    finish();
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});
