import Link from "next/link";
import { HiChevronRight, HiOutlineShoppingBag } from "react-icons/hi2";
import { RiCarLine } from "react-icons/ri";

import { ILiveActivity } from "../../types/Superapp";
import LocalTime from "./LocalTime";

const ICONS = { order: HiOutlineShoppingBag, ride: RiCarLine };

/** "On the way · arrives 14:35" */
export function LiveStatus({ item }: { item: ILiveActivity }) {
  return (
    <>
      {item.status}
      {item.eta && (
        <>
          {" · arrives "}
          <LocalTime iso={item.eta} />
        </>
      )}
    </>
  );
}

/** One thing in progress, as a single link to its page. */
export default function LiveActivityRow({
  item,
  compact = false,
}: {
  item: ILiveActivity;
  compact?: boolean;
}) {
  const Icon = ICONS[item.kind];
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 outline-offset-[-2px] transition-colors hover:bg-fg/[0.03] ${
        compact ? "px-4 py-2" : "px-4 py-3"
      }`}
    >
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg text-primary"
      >
        <Icon />
      </span>
      <span className="min-w-0 flex-1 leading-5">
        <span className="block truncate text-[15px] font-bold">
          {item.title}
        </span>
        <span className="block truncate text-[13px] text-muted">
          <LiveStatus item={item} />
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5 text-[13px] font-bold text-primary">
        Track
        <HiChevronRight aria-hidden="true" />
      </span>
    </Link>
  );
}
