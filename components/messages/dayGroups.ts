// Chat day separators: "Today", "Yesterday", "Oct 6", in the reader's time
// zone. Before hydration the server's HTML used UTC, so the first client
// render passes timeZone "UTC" too and matches it.

const DAY = 24 * 60 * 60 * 1000;

const dayKey = (date: Date, timeZone?: string) =>
  date.toLocaleDateString("en-CA", { timeZone });

export function dayLabel(iso: string, now: number, timeZone?: string): string {
  const key = dayKey(new Date(iso), timeZone);
  if (key === dayKey(new Date(now), timeZone)) return "Today";
  if (key === dayKey(new Date(now - DAY), timeZone)) return "Yesterday";
  const date = new Date(iso);
  const sameYear =
    date.toLocaleDateString("en-US", { year: "numeric", timeZone }) ===
    new Date(now).toLocaleDateString("en-US", { year: "numeric", timeZone });
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone,
  });
}

/** Consecutive items of the same day, in the order given. */
export function groupByDay<T extends { createdAt: string }>(
  items: T[],
  now: number,
  timeZone?: string
): { label: string; items: T[] }[] {
  const groups: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const label = dayLabel(item.createdAt, now, timeZone);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}
