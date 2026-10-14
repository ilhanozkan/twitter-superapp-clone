import { useCallback, useSyncExternalStore } from "react";

const supported = () => typeof window.matchMedia === "function";

/**
 * Whether a media query matches, e.g. "(min-width: 1024px)" for work only
 * the two-pane layout needs, or "(pointer: coarse)". False on the server
 * and while hydrating, so the first render matches the server's HTML.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!supported()) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => supported() && window.matchMedia(query).matches,
    () => false
  );
}
