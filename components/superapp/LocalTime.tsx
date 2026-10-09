import { formatFullDate, formatRelativeTime } from "../../lib/format";

const clock = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dayMonth = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const FORMATS = {
  /** "14:35" */
  time: (iso: string) => clock.format(new Date(iso)),
  /** "Oct 6" */
  date: (iso: string) => dayMonth.format(new Date(iso)),
  /** "3:04 PM · Oct 8, 2026" */
  full: formatFullDate,
  /** "5m", "3h", "Oct 3" */
  relative: (iso: string) => formatRelativeTime(iso),
};

/**
 * A time in the reader's own time zone. The server renders it in its zone
 * first, so (like RelativeTime) the text may change during hydration.
 */
export default function LocalTime({
  iso,
  format = "time",
  className,
}: {
  iso: string;
  format?: keyof typeof FORMATS;
  className?: string;
}) {
  return (
    <time
      dateTime={iso}
      title={formatFullDate(iso)}
      className={className}
      suppressHydrationWarning
    >
      {FORMATS[format](iso)}
    </time>
  );
}
