// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useServerNow } from "./useServerNow";

// The device clock runs a minute behind the server.
const DEVICE = Date.parse("2026-10-09T14:00:00.000Z");
const SERVER = "2026-10-09T14:01:00.000Z";
const after = (ms: number) => new Date(Date.parse(SERVER) + ms).toISOString();

/** Lets `seconds` pass one tick at a time, rendering after each like a browser. */
function wait(seconds: number) {
  for (let i = 0; i < seconds; i++) {
    act(() => vi.advanceTimersByTime(1_000));
  }
}

beforeEach(() => {
  vi.useFakeTimers({ now: DEVICE });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useServerNow", () => {
  it("starts at the server's time and ticks on the server's clock", () => {
    const { result } = renderHook(() => useServerNow(SERVER, after(60_000)));
    expect(result.current.toISOString()).toBe(SERVER);

    wait(3);
    expect(result.current.toISOString()).toBe(after(3_000));
  });

  it("stops once `until` has passed, and doesn't tick without one", () => {
    const { result } = renderHook(() => useServerNow(SERVER, after(2_000)));
    wait(5);
    expect(result.current.toISOString()).toBe(after(2_000));
    expect(vi.getTimerCount()).toBe(0);

    const idle = renderHook(() => useServerNow(SERVER, null));
    wait(5);
    expect(idle.result.current.toISOString()).toBe(SERVER);
  });
});
