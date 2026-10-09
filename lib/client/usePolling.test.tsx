// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePolling } from "./usePolling";

let visibility: DocumentVisibilityState = "visible";
let online = true;

function setVisibility(value: DocumentVisibilityState) {
  visibility = value;
  document.dispatchEvent(new Event("visibilitychange"));
}

function setOnline(value: boolean) {
  online = value;
  window.dispatchEvent(new Event(value ? "online" : "offline"));
}

/** Advances fake time and lets the polls it starts settle. */
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  online = true;
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => online,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("usePolling", () => {
  it("polls every interval, not on mount", async () => {
    const fn = vi.fn(async () => {});
    renderHook(() => usePolling(fn, { interval: 1000 }));

    await advance(999);
    expect(fn).not.toHaveBeenCalled();
    await advance(1);
    expect(fn).toHaveBeenCalledTimes(1);
    await advance(1000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does nothing while disabled", async () => {
    const fn = vi.fn(async () => {});
    renderHook(() => usePolling(fn, { interval: 1000, enabled: false }));
    await advance(5000);
    expect(fn).not.toHaveBeenCalled();
  });

  it("pauses while the page is hidden and polls once it is back", async () => {
    const fn = vi.fn(async () => {});
    renderHook(() => usePolling(fn, { interval: 1000 }));

    act(() => setVisibility("hidden"));
    await advance(10_000);
    expect(fn).not.toHaveBeenCalled();

    act(() => setVisibility("visible"));
    await advance(0);
    expect(fn).toHaveBeenCalledTimes(1);
    await advance(1000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("pauses while offline and polls once back online", async () => {
    const fn = vi.fn(async () => {});
    renderHook(() => usePolling(fn, { interval: 1000 }));

    act(() => setOnline(false));
    await advance(10_000);
    expect(fn).not.toHaveBeenCalled();

    act(() => setOnline(true));
    await advance(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("backs off exponentially on errors, up to backoffMax, and resets on success", async () => {
    let fail = true;
    const fn = vi.fn(async () => {
      if (fail) throw new Error("down");
    });
    const { result } = renderHook(() =>
      usePolling(fn, { interval: 1000, backoffMax: 5000 })
    );

    await advance(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current.failures).toBe(1);

    // 2 s after one failure, 4 s after two, then capped at 5 s.
    await advance(1999);
    expect(fn).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fn).toHaveBeenCalledTimes(2);
    await advance(4000);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(result.current.failures).toBe(3);
    await advance(4999);
    expect(fn).toHaveBeenCalledTimes(3);
    await advance(1);
    expect(fn).toHaveBeenCalledTimes(4);

    fail = false;
    await advance(5000);
    expect(fn).toHaveBeenCalledTimes(5);
    expect(result.current.failures).toBe(0);
    await advance(1000);
    expect(fn).toHaveBeenCalledTimes(6);
  });

  it("stops on unmount", async () => {
    const fn = vi.fn(async () => {});
    const { unmount } = renderHook(() => usePolling(fn, { interval: 1000 }));
    unmount();
    await advance(5000);
    act(() => setVisibility("visible"));
    expect(fn).not.toHaveBeenCalled();
  });

  it("refreshNow polls at once and restarts the interval", async () => {
    const fn = vi.fn(async () => {});
    const { result } = renderHook(() => usePolling(fn, { interval: 1000 }));

    await advance(600);
    act(() => result.current.refreshNow());
    await advance(0);
    expect(fn).toHaveBeenCalledTimes(1);
    await advance(999);
    expect(fn).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("never overlaps polls: a refresh during one runs right after it", async () => {
    let finish: () => void = () => {};
    const fn = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const { result } = renderHook(() => usePolling(fn, { interval: 1000 }));

    act(() => result.current.refreshNow());
    act(() => result.current.refreshNow());
    expect(fn).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("calls the latest fn", async () => {
    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {});
    const { rerender } = renderHook(
      ({ fn }) => usePolling(fn, { interval: 1000 }),
      { initialProps: { fn: first } }
    );
    rerender({ fn: second });
    await advance(1000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
