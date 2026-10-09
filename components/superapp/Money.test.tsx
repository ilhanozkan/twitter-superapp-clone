// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import Money from "./Money";

afterEach(() => {
  cleanup();
});

describe("Money", () => {
  it("shows a plain amount as text", () => {
    const { container } = render(<Money amount={123_450} />);
    expect(container.textContent).toBe("1,234.50 credits");
  });

  it("signs received amounts and says so to screen readers", () => {
    const { container } = render(<Money amount={1_250} direction="received" />);
    const [visible, spoken] = container.querySelectorAll("span span");
    expect(visible.textContent).toBe("+12.50 credits");
    expect(visible.getAttribute("aria-hidden")).toBe("true");
    expect(spoken.textContent).toBe("received 12.50 credits");
    expect(spoken.className).toContain("sr-only");
    expect(container.firstElementChild?.className).toContain("text-success");
  });

  it("signs sent amounts with a minus, in the default colour", () => {
    const { container } = render(<Money amount={450} direction="sent" />);
    const [visible, spoken] = container.querySelectorAll("span span");
    expect(visible.textContent).toBe("−4.50 credits");
    expect(spoken.textContent).toBe("sent 4.50 credits");
    expect(container.firstElementChild?.className).not.toContain(
      "text-success"
    );
  });

  it("can leave out the unit", () => {
    const { container } = render(<Money amount={29_360} unit={false} />);
    expect(container.textContent).toBe("293.60");
  });
});
