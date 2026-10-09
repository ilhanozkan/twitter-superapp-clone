import { useEffect, useRef } from "react";

/**
 * For a page's sticky header: keeps `--sticky-header` on <html> at the
 * header's height, which globals.css adds to `scroll-padding-top`, so the
 * browser scrolls focused elements below the header even while it grows
 * (a live activity banner adds a row). Without it, the default fits a
 * one-row header.
 */
export function useStickyHeader<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const header = ref.current;
    if (!header || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      root.style.setProperty("--sticky-header", `${header.offsetHeight}px`);
    });
    observer.observe(header);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--sticky-header");
    };
  }, []);

  return ref;
}
