import { useEffect, useState } from "react";

import { useServerClock } from "../../lib/client/useServerClock";

/**
 * The server's time (ms), re-read every `interval` while `enabled`, so an
 * order's stages move between polls (`orderAt(order, new Date(now))`).
 * The first render uses `serverNow` itself, so hydration matches the
 * server's HTML whatever the device clock says. It never goes backwards,
 * nor before `serverNow`: a stage once shown stays shown, and a new poll
 * never shows less than the server said.
 */
export function useServerTime(
  serverNow: string,
  interval: number,
  enabled = true
): number {
  const clock = useServerClock(serverNow);
  const [now, setNow] = useState(() => Date.parse(serverNow));

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(
      () => setNow((last) => Math.max(last, clock.now().getTime())),
      interval
    );
    return () => clearInterval(timer);
  }, [clock, interval, enabled]);

  return Math.max(now, Date.parse(serverNow));
}
