/** The most a badge shows; more reads "99+". */
export const BADGE_MAX = 99;

export const badgeText = (count: number) =>
  count > BADGE_MAX ? `${BADGE_MAX}+` : String(count);

/**
 * A count on a nav icon: white on the filled primary (5.09:1). Decorative:
 * the count is part of the link's accessible name ("Notifications, 3 new").
 */
export default function Badge({
  count,
  className = "",
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary-fill px-1 text-[11px] font-bold tabular-nums leading-none text-white ring-1 ring-surface ${className}`}
    >
      {badgeText(count)}
    </span>
  );
}
