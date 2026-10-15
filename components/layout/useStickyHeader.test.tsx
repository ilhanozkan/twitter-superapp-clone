// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useStickyHeader } from "./useStickyHeader";

function Header() {
  const header = useStickyHeader<HTMLDivElement>();
  return <div ref={header}>Home</div>;
}

const height = () =>
  document.documentElement.style.getPropertyValue("--sticky-header");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useStickyHeader", () => {
  it("publishes the header's height while it is mounted", () => {
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
      .mockReturnValue(54);

    const { unmount } = render(<Header />);
    expect(height()).toBe("54px");

    // A live activity banner appears under the title row.
    offsetHeight.mockReturnValue(111);
    act(() => resized!());
    expect(height()).toBe("111px");

    unmount();
    expect(height()).toBe("");
    expect(resized).toBeNull();
  });

  it("leaves the default where ResizeObserver is missing", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    render(<Header />);
    expect(height()).toBe("");
  });
});
