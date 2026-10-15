import { useEffect } from "react";

import { usePolling } from "../../lib/client/usePolling";
import { useServerClock } from "../../lib/client/useServerClock";
import { fetchActivity } from "../../slices/activitySlice";
import { useAppDispatch, useAppSelector } from "../../store";

/** How often the shell refreshes badges and live activity while visible. */
export const ACTIVITY_INTERVAL = 30_000;

// Polling past the change, so the server's clock has certainly passed it.
const AFTER_CHANGE_MS = 500;
const MAX_TIMEOUT = 2 ** 31 - 1;

/**
 * Keeps badges and live activity current: polls GET /api/activity every
 * 30 s while the page is visible, right away when server-rendered counts
 * need this device's "seen" time, and early when an item is due to change
 * (`nextChangeAt`, read on the server's clock).
 */
export function useActivityPolling() {
  const dispatch = useAppDispatch();
  const hasViewer = useAppSelector((state) => !!state.session.viewer);
  const loaded = useAppSelector((state) => state.activity.loaded);
  const live = useAppSelector((state) => state.activity.live);
  const serverNow = useAppSelector((state) => state.activity.serverNow);
  const clock = useServerClock(serverNow);

  const { refreshNow } = usePolling(() => dispatch(fetchActivity()).unwrap(), {
    interval: ACTIVITY_INTERVAL,
    enabled: hasViewer,
  });

  useEffect(() => {
    if (hasViewer && !loaded) refreshNow();
  }, [hasViewer, loaded, refreshNow]);

  const nextChange = live
    .map((item) => item.nextChangeAt)
    .filter((at): at is string => at !== null)
    .sort()[0];

  useEffect(() => {
    if (!nextChange) return;
    const wait = Date.parse(nextChange) - clock.now().getTime();
    const timer = setTimeout(
      refreshNow,
      Math.min(Math.max(0, wait) + AFTER_CHANGE_MS, MAX_TIMEOUT)
    );
    return () => clearTimeout(timer);
  }, [nextChange, clock, refreshNow]);
}
