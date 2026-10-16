// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { rideQuotes } from "../../lib/superapp/rides";
import { IRideQuote, RideType } from "../../types/Ride";
import RideOptions from "./RideOptions";

// user-event walks radio groups by name with CSS.escape, which jsdom lacks.
beforeEach(() => {
  if (!globalThis.CSS?.escape) {
    vi.stubGlobal("CSS", {
      escape: (value: string) =>
        value.replace(/[^\w-]/g, (char) => `\\${char}`),
    });
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Kızılay → Atakule with the given types out of drivers. */
const quotes = (...unavailable: RideType[]) =>
  rideQuotes("kizilay", "atakule", (type) => !unavailable.includes(type))
    .quotes;

function Picker({
  options,
  onChange = () => {},
}: {
  options: IRideQuote[];
  onChange?: (type: RideType) => void;
}) {
  const [value, setValue] = useState<RideType>("economy");
  return (
    <RideOptions
      quotes={options}
      value={value}
      onChange={(type) => {
        setValue(type);
        onChange(type);
      }}
    />
  );
}

describe("RideOptions", () => {
  it("is a native radio group named “Choose a ride”, each option a full sentence", () => {
    render(<Picker options={quotes()} />);
    const group = screen.getByRole("group", { name: "Choose a ride" });
    expect(group.tagName.toLowerCase()).toBe("fieldset");

    const radios = screen.getAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("aria-label"))).toEqual([
      expect.stringMatching(
        /^Economy · 6\.30 credits · \d min away · 4 seats$/
      ),
      expect.stringMatching(
        /^Comfort · 8\.90 credits · \d min away · 4 seats$/
      ),
      expect.stringMatching(/^XL · 11\.10 credits · \d min away · 6 seats$/),
    ]);
    expect(
      (screen.getByRole("radio", { name: /^Economy/ }) as HTMLInputElement)
        .checked
    ).toBe(true);
  });

  it("moves the choice with the arrow keys", async () => {
    const onChange = vi.fn();
    render(<Picker options={quotes()} onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("radio", { name: /^Economy/ }));
    await user.keyboard("{ArrowDown}");
    expect(onChange).toHaveBeenLastCalledWith("comfort");
    expect(document.activeElement).toBe(
      screen.getByRole("radio", { name: /^Comfort/ })
    );
    await user.keyboard("{ArrowDown}");
    expect(onChange).toHaveBeenLastCalledWith("xl");
    await user.keyboard("{ArrowUp}");
    expect(onChange).toHaveBeenLastCalledWith("comfort");
  });

  it("shows “No drivers nearby” and skips a type with no free driver", async () => {
    const onChange = vi.fn();
    render(<Picker options={quotes("comfort")} onChange={onChange} />);

    const comfort = screen.getByRole("radio", {
      name: "Comfort · 8.90 credits · No drivers nearby",
    }) as HTMLInputElement;
    expect(comfort.disabled).toBe(true);
    expect(screen.getByText("No drivers nearby")).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /^Economy/ }));
    await user.keyboard("{ArrowDown}");
    expect(onChange).toHaveBeenLastCalledWith("xl");
    expect(comfort.checked).toBe(false);
  });
});
