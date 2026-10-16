// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useBarHeight } from "./useBarHeight";

function Bar() {
  const bar = useBarHeight<HTMLDivElement>("--book-bar");
  return <div ref={bar}>Book</div>;
}

const height = () =>
  document.documentElement.style.getPropertyValue("--book-bar");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useBarHeight", () => {
  it("publishes the bar's height while it is mounted", () => {
    let resized: (() => void) | null = null;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        callback: ResizeObserverCallback;
        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
        }
        observe() {
          resized = () => this.callback([], this as unknown as ResizeObserver);
          resized();
        }
        disconnect() {
          resized = null;
        }
      }
    );
    const offsetHeight = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockReturnValue(77);

    const { unmount } = render(<Bar />);
    expect(height()).toBe("77px");

    // An error appears above the button.
    offsetHeight.mockReturnValue(148);
    act(() => resized!());
    expect(height()).toBe("148px");

    unmount();
    expect(height()).toBe("");
    expect(resized).toBeNull();
  });

  it("leaves the CSS fallback where ResizeObserver is missing", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    render(<Bar />);
    expect(height()).toBe("");
  });
});
