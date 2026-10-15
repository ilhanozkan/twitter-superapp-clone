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

  it("hands back to globals.css while the bar isn't displayed", () => {
    stubResizeObserver();
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(56);
    // The compose button: 72px up on phones, `display: none` from 500px.
    const { container } = render(<Bar bottom="72px" />);
    const button = container.firstChild as HTMLElement;
    expect(padding()).toBe(`${72 + 56 + 16}px`);

    button.style.display = "none";
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(padding()).toBe("");

    button.style.display = "";
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(padding()).toBe(`${72 + 56 + 16}px`);
  });

  it("keeps clear of the one reaching highest while two are shown", () => {
    stubResizeObserver();
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        return Number(this.dataset.height);
      }
    );
    function Bars({ both }: { both: boolean }) {
      const [low, setLow] = useState<HTMLDivElement | null>(null);
      const [high, setHigh] = useState<HTMLDivElement | null>(null);
      useBottomScrollPadding(low);
      useBottomScrollPadding(both ? high : null);
      return (
        <>
          <div ref={setLow} data-height="60" style={{ bottom: "53px" }} />
          <div ref={setHigh} data-height="56" style={{ bottom: "72px" }} />
        </>
      );
    }

    // Whichever mounted or changed last, the higher one counts.
    const { rerender, unmount } = render(<Bars both />);
    expect(padding()).toBe(`${72 + 56 + 16}px`);
    rerender(<Bars both={false} />);
    expect(padding()).toBe(`${53 + 60 + 16}px`);
    rerender(<Bars both />);
    expect(padding()).toBe(`${72 + 56 + 16}px`);

    unmount();
    expect(padding()).toBe("");
  });
});
