const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const plural = (count: number, unit: string) =>
  `${count} ${unit}${count === 1 ? "" : "s"}`;

/** "posted 2 hours ago", for the viewer's announcement (the header shows "2h"). */
export function postedAgo(iso: string, now: number = Date.now()): string {
  const elapsed = Math.max(0, now - Date.parse(iso));
  if (elapsed < MINUTE) return "posted just now";
  if (elapsed < HOUR)
    return `posted ${plural(Math.floor(elapsed / MINUTE), "minute")} ago`;
  return `posted ${plural(Math.floor(elapsed / HOUR), "hour")} ago`;
}

/** "Mert" from "Mert Demir", for "Reply to Mert…". */
export function firstName(fullname: string): string {
  return fullname.trim().split(/\s+/)[0] || fullname;
}

/** "Story 2 of 3 by Mert Demir, posted 2 hours ago": the viewer's live region. */
export function storyPosition(
  index: number,
  count: number,
  author: string,
  createdAt: string,
  now?: number
): string {
  return `Story ${index + 1} of ${count} by ${author}, ${postedAgo(createdAt, now)}`;
}
