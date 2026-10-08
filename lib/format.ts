const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const monthDay = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const monthDayYear = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const time = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});
const monthYear = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});
const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Twitter-style short timestamps: "now", "42s", "5m", "3h", "Oct 3", "Oct 3, 2024". */
export function formatRelativeTime(
  iso: string,
  now: number = Date.now()
): string {
  const date = new Date(iso);
  const elapsed = now - date.getTime();

  if (elapsed < 5 * SECOND) return "now";
  if (elapsed < MINUTE) return `${Math.floor(elapsed / SECOND)}s`;
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;

  return date.getFullYear() === new Date(now).getFullYear()
    ? monthDay.format(date)
    : monthDayYear.format(date);
}

/** "3:04 PM · Oct 8, 2026", as on a tweet's own page. */
export function formatFullDate(iso: string): string {
  const date = new Date(iso);
  return `${time.format(date)} · ${monthDayYear.format(date)}`;
}

/** "Joined June 2020" */
export function formatJoinDate(iso: string): string {
  return `Joined ${monthYear.format(new Date(iso))}`;
}

/** 999, 1.2K, 3.4M */
export function formatCount(count: number): string {
  return compact.format(count);
}

/** "1 Tweet", "1,204 Tweets" */
export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`
) {
  return `${count.toLocaleString("en-US")} ${count === 1 ? singular : plural}`;
}
