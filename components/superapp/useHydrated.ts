import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False on the server and while hydrating, true afterwards. Text that
 * depends on the reader's time zone (day groups) renders in UTC until then,
 * so the first client render matches the server's HTML.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
