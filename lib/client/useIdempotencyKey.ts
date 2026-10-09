import { useCallback, useState } from "react";

/** A fresh Idempotency-Key (matches the server's [A-Za-z0-9_-]{8,64}). */
export function newIdempotencyKey(): string {
  const { crypto } = globalThis;
  // randomUUID needs a secure context; getRandomValues works everywhere.
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

const sameDeps = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length &&
  a.every((value, index) => Object.is(value, b[index]));

/**
 * The key for one money operation the user is about to confirm. It stays
 * the same across retries (so the server replays instead of paying twice),
 * changes when `deps` (amount, note, recipient...) change, because that is
 * a different operation, and `rotate()` drops it after a success.
 */
export function useIdempotencyKey(deps: readonly unknown[]): {
  key: string;
  rotate: () => void;
} {
  const [state, setState] = useState(() => ({
    deps,
    key: newIdempotencyKey(),
  }));

  let current = state;
  if (!sameDeps(state.deps, deps)) {
    // Derived from the previous render's deps: update during render so the
    // new key is used right away, never the one for the old operation.
    current = { deps, key: newIdempotencyKey() };
    setState(current);
  }

  const rotate = useCallback(
    () => setState((value) => ({ ...value, key: newIdempotencyKey() })),
    []
  );
  return { key: current.key, rotate };
}
