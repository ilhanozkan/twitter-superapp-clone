import { useEffect, useMemo, useState } from "react";

import { useServerClock } from "../../lib/client/useServerClock";

/**
 * The server's time, ticking every second until `until` (null: not at all).
 * It starts at `serverNow`, so the first render matches the server's HTML,
 * then follows the device clock corrected by the server's offset
 * (useServerClock), which each new `serverNow` re-measures.
 */
export function useServerNow(serverNow: string, until: string | null): Date {
  const clock = useServerClock(serverNow);
  const [now, setNow] = useState(() => Date.parse(serverNow));
  const running = until !== null && now < Date.parse(until);

  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(clock.now().getTime());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [running, clock]);

  return useMemo(() => new Date(now), [now]);
}
