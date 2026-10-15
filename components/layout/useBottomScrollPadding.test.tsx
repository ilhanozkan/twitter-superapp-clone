// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useBottomScrollPadding } from "./useBottomScrollPadding";

function Bar({ bottom }: { bottom: string }) {
  const [bar, setBar] = useState<HTMLDivElement | null>(null);
  useBottomScrollPadding(bar);
  return (
    <div ref={setBar} style={{ position: "sticky", bottom }}>
      Book
    </div>
  );
}

const padding = () =>
  document.documentElement.style.getPropertyValue("scroll-padding-bottom");

/** A ResizeObserver whose callback the test calls. */
function stubResizeObserver() {
  const observer = { resized: null as (() => void) | null };
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe() {
        observer.resized = () =>
          this.callback([], this as unknown as ResizeObserver);
      }
      disconnect() {
        observer.resized = null;
      }
    }
  );
  return observer;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useBottomScrollPadding", () => {
  it("pads the root by the bar, its offset and a gap while it is shown", () => {
    const observer = stubResizeObserver();
    const offsetHeight = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockReturnValue(77);

    // On phones the bar sits on the 53px tab bar.
    const { unmount } = render(<Bar bottom="53px" />);
    expect(padding()).toBe(`${53 + 77 + 16}px`);

    // An error appears above the button.
    offsetHeight.mockReturnValue(148);
    act(() => observer.resized!());
    expect(padding()).toBe(`${53 + 148 + 16}px`);

    unmount();
    expect(padding()).toBe("");
    expect(observer.resized).toBeNull();
  });

  it("follows the window across the phone breakpoint", () => {
    stubResizeObserver();
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(60);
    const { container } = render(<Bar bottom="53px" />);
    expect(padding()).toBe(`${53 + 60 + 16}px`);

    // Wider than a phone: no tab bar, the bar sits at the bottom.
    (container.firstChild as HTMLElement).style.bottom = "0px";
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(padding()).toBe(`${60 + 16}px`);
  });
});
