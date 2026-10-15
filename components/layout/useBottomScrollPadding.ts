import { useEffect } from "react";

/** Room between a focused control and the bar, as globals.css leaves above the tab bar. */
const GAP = 16;

/** Everything mounted components keep at the bottom of the screen. */
const bars = new Set<HTMLElement>();

/**
 * Pads <html> by the largest footprint (height plus offset from the
 * bottom) among the bars that are displayed, or hands back to globals.css
 * when none is.
 */
function applyPadding() {
  const root = document.documentElement;
  let padding = 0;
  for (const bar of bars) {
    const style = getComputedStyle(bar);
    if (style.display === "none") continue;
    const offset = parseFloat(style.bottom) || 0;
    padding = Math.max(padding, offset + bar.offsetHeight + GAP);
  }
  if (padding > 0) {
    root.style.setProperty("scroll-padding-bottom", `${padding}px`);
  } else {
    root.style.removeProperty("scroll-padding-bottom");
  }
}

/**
 * For something kept at the bottom of the screen over the page (a sticky
 * bar, the phones' floating compose button): while `bar` is displayed,
 * <html>'s scroll-padding-bottom covers it (its height plus its offset from
 * the bottom, which is the tab bar on phones), so the browser scrolls a
 * focused control clear of it instead of leaving it underneath (WCAG
 * 2.4.11). With several, the one reaching highest counts. While none is
 * displayed (the compose button is phone-only) or once all are gone,
 * globals.css's padding applies again.
 */
export function useBottomScrollPadding(bar: HTMLElement | null) {
  useEffect(() => {
    if (!bar) return;
    bars.add(bar);
    applyPadding();
    // The height follows the text size; the offset and display, the phone breakpoint.
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(applyPadding);
    observer?.observe(bar);
    window.addEventListener("resize", applyPadding);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", applyPadding);
      bars.delete(bar);
      applyPadding();
    };
  }, [bar]);
}
