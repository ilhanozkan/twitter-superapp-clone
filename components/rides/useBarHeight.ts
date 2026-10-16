import { useEffect, useRef } from "react";

/**
 * For a sticky bottom bar: keeps the CSS variable `name` on <html> at the
 * bar's height while it is mounted, as useStickyHeader does for the
 * header. The bar's own styles add it to the root's `scroll-padding-bottom`,
 * so the browser scrolls focused controls clear of the bar even as it
 * grows (a reason or an error above the button). Without ResizeObserver
 * the CSS fallback applies.
 */
export function useBarHeight<T extends HTMLElement>(name: string) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const bar = ref.current;
    if (!bar || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      root.style.setProperty(name, `${bar.offsetHeight}px`);
    });
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty(name);
    };
  }, [name]);

  return ref;
}
