// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IDEMPOTENCY_KEY_PATTERN } from "../superapp/idempotency";
import { newIdempotencyKey, useIdempotencyKey } from "./useIdempotencyKey";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("newIdempotencyKey", () => {
  it("makes keys the server accepts, different every time", () => {
    const keys = new Set(Array.from({ length: 20 }, newIdempotencyKey));
    expect(keys.size).toBe(20);
    for (const key of keys) expect(key).toMatch(IDEMPOTENCY_KEY_PATTERN);
  });

  it("works without randomUUID (insecure contexts)", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(171),
    });
    expect(newIdempotencyKey()).toBe("ab".repeat(16));
  });
});

describe("useIdempotencyKey", () => {
  it("keeps the key across renders (retries reuse it)", () => {
    const { result, rerender } = renderHook(
      ({ amount }) => useIdempotencyKey(["sarahcodes", amount]),
      { initialProps: { amount: 1000 } }
    );
    const first = result.current.key;
    rerender({ amount: 1000 });
    expect(result.current.key).toBe(first);
  });

  it("changes the key when the operation changes", () => {
    const { result, rerender } = renderHook(
      ({ to, amount, note }) => useIdempotencyKey([to, amount, note]),
      {
        initialProps: {
          to: "sarahcodes",
          amount: 1000,
          note: null as string | null,
        },
      }
    );
    const keys = [result.current.key];
    rerender({ to: "sarahcodes", amount: 1500, note: null });
    keys.push(result.current.key);
    rerender({ to: "sarahcodes", amount: 1500, note: "Lunch" });
    keys.push(result.current.key);
    rerender({ to: "devmarco", amount: 1500, note: "Lunch" });
    keys.push(result.current.key);
    expect(new Set(keys).size).toBe(4);

    // Stable again once the operation stops changing.
    rerender({ to: "devmarco", amount: 1500, note: "Lunch" });
    expect(result.current.key).toBe(keys[3]);
  });

  it("rotate() drops the key after a success", () => {
    const { result } = renderHook(() => useIdempotencyKey(["x", 1]));
    const first = result.current.key;
    act(() => result.current.rotate());
    expect(result.current.key).not.toBe(first);
    expect(result.current.key).toMatch(IDEMPOTENCY_KEY_PATTERN);
  });
});
