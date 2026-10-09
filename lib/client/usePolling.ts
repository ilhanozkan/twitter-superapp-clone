import { useCallback, useEffect, useRef, useState } from "react";

export interface PollingOptions {
  /** Milliseconds between successful polls. */
  interval: number;
  enabled?: boolean;
  /** The longest wait between polls while they keep failing. */
  backoffMax?: number;
}

export interface Polling {
  /** Consecutive failed polls; 0 after a success. */
  failures: number;
  /** Poll now (after the one in flight, if any) and restart the interval. */
  refreshNow: () => void;
}

// Nothing runs in the background on the server (§4 "No background work"):
// clients poll. They stop while the tab is hidden or the device is offline,
// so a forgotten tab costs nothing, and poll once as soon as they are back.
const isActive = () =>
  document.visibilityState !== "hidden" && navigator.onLine !== false;

/**
 * Calls `fn` every `interval` ms while enabled, the page is visible and the
 * device is online. After a failure the wait doubles (interval × 2^failures,
 * at most `backoffMax`); a success resets it. Polls never overlap.
 */
export function usePolling(
  fn: () => Promise<unknown>,
  { interval, enabled = true, backoffMax = 60_000 }: PollingOptions
): Polling {
  const latest = useRef(fn);
  const [failures, setFailures] = useState(0);
  const pollNow = useRef<() => void>(() => {});

  useEffect(() => {
    latest.current = fn;
  });

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let again = false;
    let disposed = false;
    let failed = 0;

    const schedule = () => {
      clearTimeout(timer);
      if (disposed || !isActive()) return;
      const wait =
        failed === 0 ? interval : Math.min(interval * 2 ** failed, backoffMax);
      timer = setTimeout(run, wait);
    };

    const run = async () => {
      clearTimeout(timer);
      if (disposed || !isActive()) return;
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        await latest.current();
        failed = 0;
      } catch {
        failed += 1;
      }
      running = false;
      if (disposed) return;
      setFailures(failed);
      if (again) {
        again = false;
        void run();
      } else {
        schedule();
      }
    };

    const onChange = () => {
      if (isActive()) void run();
      else clearTimeout(timer);
    };

    document.addEventListener("visibilitychange", onChange);
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    pollNow.current = () => void run();
    schedule();

    return () => {
      disposed = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onChange);
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
      pollNow.current = () => {};
    };
  }, [enabled, interval, backoffMax]);

  const refreshNow = useCallback(() => {
    pollNow.current();
  }, []);
  return { failures, refreshNow };
}
