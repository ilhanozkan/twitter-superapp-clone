// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useServerClock } from "./useServerClock";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-09T12:00:00.000Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useServerClock", () => {
  it("reads time on the server's clock, keeping the offset as time passes", () => {
    // The device clock is 90 s behind the server.
    const { result } = renderHook(() =>
      useServerClock("2026-10-09T12:01:30.000Z")
    );
    expect(result.current.now().toISOString()).toBe("2026-10-09T12:01:30.000Z");

    vi.advanceTimersByTime(10_000);
    expect(result.current.now().toISOString()).toBe("2026-10-09T12:01:40.000Z");
  });

  it("follows a new serverNow and falls back to the device clock without one", () => {
    const { result, rerender } = renderHook(
      ({ serverNow }) => useServerClock(serverNow),
      { initialProps: { serverNow: null as string | null } }
    );
    expect(result.current.now().toISOString()).toBe("2026-10-09T12:00:00.000Z");

    rerender({ serverNow: "2026-10-09T11:59:00.000Z" });
    expect(result.current.now().toISOString()).toBe("2026-10-09T11:59:00.000Z");
  });

  it("returns the same clock across renders (safe as an effect dependency)", () => {
    const { result, rerender } = renderHook(() =>
      useServerClock("2026-10-09T12:00:00.000Z")
    );
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
