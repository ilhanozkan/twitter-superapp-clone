// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { revealFocusedItem } from "./revealFocusedItem";

function List() {
  return (
    <ul onFocus={revealFocusedItem}>
      <li>
        <a href="#kizilaykahve">Kızılay Kahve</a>
      </li>
      <li>
        <button type="button">Lahmacun Lab</button>
      </li>
    </ul>
  );
}

/** jsdom has no scrollIntoView; a spy stands in for the browser's. */
function spyOnScrollIntoView() {
  const scrollIntoView = vi.fn();
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
  return scrollIntoView;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

describe("revealFocusedItem", () => {
  it("scrolls the item that took keyboard focus into view, sideways and no further", () => {
    const scrollIntoView = spyOnScrollIntoView();
    render(<List />);
    const button = screen.getByRole("button", { name: "Lahmacun Lab" });

    button.focus();

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(button.closest("li"));
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
    });
  });

  it("leaves the list where it is when a pointer gave the focus", () => {
    const scrollIntoView = spyOnScrollIntoView();
    render(<List />);
    const link = screen.getByRole("link", { name: "Kızılay Kahve" });
    vi.spyOn(Element.prototype, "matches").mockImplementation(
      (selector: string) => selector !== ":focus-visible"
    );

    link.focus();

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("reveals anyway where :focus-visible is unknown", () => {
    const scrollIntoView = spyOnScrollIntoView();
    render(<List />);
    const link = screen.getByRole("link", { name: "Kızılay Kahve" });
    vi.spyOn(Element.prototype, "matches").mockImplementation(() => {
      throw new SyntaxError("unknown pseudo-class");
    });

    fireEvent.focus(link);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("does nothing where scrollIntoView doesn't exist", () => {
    render(<List />);
    expect(() =>
      screen.getByRole("button", { name: "Lahmacun Lab" }).focus()
    ).not.toThrow();
  });
});
