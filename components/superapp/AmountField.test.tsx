// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AmountField, { amountError } from "./AmountField";

afterEach(() => {
  cleanup();
});

function Harness({ onCents }: { onCents: (cents: number | null) => void }) {
  const [value, setValue] = useState("");
  return (
    <>
      <AmountField
        value={value}
        min={50}
        max={20_000}
        onChange={(next, cents) => {
          setValue(next);
          onCents(cents);
        }}
      />
      <button type="button">Next</button>
    </>
  );
}

describe("amountError", () => {
  it.each([
    ["", "Enter an amount"],
    ["12", null],
    ["12.5", null],
    ["12,50", null],
    ["0.5", null],
    ["1.234", "Enter an amount like 12.50, with at most 2 decimals"],
    ["-1", "Enter an amount like 12.50, with at most 2 decimals"],
    ["1e3", "Enter an amount like 12.50, with at most 2 decimals"],
    ["0.49", "The minimum is 0.50 credits"],
    ["200.01", "The maximum is 200.00 credits"],
  ])("%j → %s", (value, error) => {
    expect(amountError(value, 50, 20_000)).toBe(error);
  });
});

describe("AmountField", () => {
  it("is a decimal text field labelled in credits, with its range", () => {
    render(<Harness onCents={() => {}} />);
    const field = screen.getByLabelText("Amount in credits");
    expect(field.getAttribute("inputmode")).toBe("decimal");
    expect(field.getAttribute("type")).toBe("text");
    expect(field.getAttribute("aria-describedby")).toContain("hint");
    expect(screen.getByText("0.50 credits to 200.00 credits")).toBeTruthy();
  });

  it("reports cents only for a valid amount within the range", async () => {
    const onCents = vi.fn();
    render(<Harness onCents={onCents} />);
    const user = userEvent.setup();
    const field = screen.getByLabelText("Amount in credits");

    await user.type(field, "12.5");
    expect(onCents).toHaveBeenLastCalledWith(1250);
    await user.clear(field);
    await user.type(field, "250");
    expect(onCents).toHaveBeenLastCalledWith(null);
  });

  it("shows format errors while typing and range errors once left", async () => {
    render(<Harness onCents={() => {}} />);
    const user = userEvent.setup();
    const field = screen.getByLabelText("Amount in credits");

    await user.type(field, "1.234");
    expect(screen.getByRole("alert").textContent).toBe(
      "Enter an amount like 12.50, with at most 2 decimals"
    );
    expect(field.getAttribute("aria-invalid")).toBe("true");

    await user.clear(field);
    await user.type(field, "0.1");
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "The minimum is 0.50 credits"
    );
    expect(field.getAttribute("aria-describedby")).toContain("error");
  });
});
