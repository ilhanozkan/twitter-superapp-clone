import { useEffect, useState } from "react";

import { formatFullDate, formatRelativeTime } from "../../lib/format";

/** Re-renders every minute so "5m" becomes "6m" without a reload. */
function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

/**
 * "5m", "3h", "Oct 3". The server and the browser render this at slightly
 * different moments (and possibly time zones), so the text is allowed to
 * differ during hydration.
 */
export default function RelativeTime({ iso }: { iso: string }) {
  const now = useNow();

  return (
    <time dateTime={iso} title={formatFullDate(iso)} suppressHydrationWarning>
      {formatRelativeTime(iso, now)}
    </time>
  );
}
