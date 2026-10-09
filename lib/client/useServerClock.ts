import { useCallback, useEffect, useMemo, useRef } from "react";

/**
 * Progress is derived from the server's clock (§7), so the client keeps the
 * offset between its own clock and the last `serverNow` it received and
 * reads time through it: "arrives in 3 min" and early polls at
 * `nextChangeAt` then agree with the server even when the device clock is
 * off. `now()` is for effects and event handlers (it reads the clock).
 */
export function useServerClock(serverNow: string | null | undefined): {
  now: () => Date;
} {
  const offset = useRef(0);

  // Measured as soon as a new serverNow arrives, which is about when it was sent.
  useEffect(() => {
    const server = serverNow ? Date.parse(serverNow) : NaN;
    offset.current = Number.isNaN(server) ? 0 : server - Date.now();
  }, [serverNow]);

  const now = useCallback(() => new Date(Date.now() + offset.current), []);
  return useMemo(() => ({ now }), [now]);
}
