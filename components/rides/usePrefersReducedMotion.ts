import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

const media = () =>
  typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null;

function subscribe(onChange: () => void) {
  const list = media();
  list?.addEventListener("change", onChange);
  return () => list?.removeEventListener("change", onChange);
}

/**
 * Whether the reader asked for less motion. The server can't know, so it
 * renders without motion and the client adds it after hydration.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => media()?.matches ?? false,
    () => true
  );
}
