/** "Sold out" as text in a pill: still on the menu, but it can't be ordered. */
export default function SoldOutBadge({
  className = "",
}: {
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full bg-fg/10 px-2 text-[13px] font-bold leading-5 text-fg ${className}`}
    >
      Sold out
    </span>
  );
}
