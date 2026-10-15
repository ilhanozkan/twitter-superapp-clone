import { useEffect } from "react";

/** Room between a focused control and the bar, as globals.css leaves above the tab bar. */
const GAP = 16;

/**
 * For a sticky bottom bar: while `bar` is shown, <html>'s
 * scroll-padding-bottom covers it (its height plus its offset from the
 * bottom, which is the tab bar on phones), so the browser scrolls a
 * focused control clear of it instead of leaving it underneath (WCAG
 * 2.4.11). Once it is gone, globals.css's padding applies again.
 */
export function useBottomScrollPadding(bar: HTMLElement | null) {
  useEffect(() => {
    if (!bar) return;
    const root = document.documentElement;
    const update = () => {
      const offset = parseFloat(getComputedStyle(bar).bottom) || 0;
      root.style.setProperty(
        "scroll-padding-bottom",
        `${offset + bar.offsetHeight + GAP}px`
      );
    };
    update();
    // The height follows the text size; the offset, the phone breakpoint.
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(bar);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      root.style.removeProperty("scroll-padding-bottom");
    };
  }, [bar]);
}
