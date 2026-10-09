import Link from "next/link";
import { ReactNode, useEffect, useRef, useState } from "react";
import { BsTwitter } from "react-icons/bs";

import { ITransfer } from "../../types/Wallet";
import Avatar from "../common/Avatar";
import { Button } from "../common/Button";
import LocalTime from "./LocalTime";
import Money from "./Money";
import { describeTransfer, isPending, transferDirection } from "./transferText";
import { useHydrated } from "./useHydrated";

interface TransferListProps {
  transfers: ITransfer[];
  /** Whose activity this is: amounts are signed from their side. */
  viewer: string;
  hasMore: boolean;
  loading: boolean;
  /** Loading the next page failed: shown with a Retry button. */
  error: string | null;
  onLoadMore: () => void;
  empty: ReactNode;
}

const DAY = 24 * 60 * 60 * 1000;
const dayKey = (date: Date, timeZone?: string) =>
  date.toLocaleDateString("en-CA", { timeZone });

/** "Today", "Yesterday", "Oct 6" in the reader's time zone (UTC before hydration). */
function dayLabel(iso: string, now: number, timeZone?: string): string {
  const key = dayKey(new Date(iso), timeZone);
  if (key === dayKey(new Date(now), timeZone)) return "Today";
  if (key === dayKey(new Date(now - DAY), timeZone)) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  });
}

function groupByDay(transfers: ITransfer[], now: number, timeZone?: string) {
  const groups: { label: string; items: ITransfer[] }[] = [];
  for (const transfer of transfers) {
    const label = dayLabel(transfer.createdAt, now, timeZone);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(transfer);
    else groups.push({ label, items: [transfer] });
  }
  return groups;
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-line px-2 text-[12px] font-bold leading-5 text-muted">
      {children}
    </span>
  );
}

function TransferRow({
  transfer,
  viewer,
  now,
}: {
  transfer: ITransfer;
  viewer: string;
  now: number;
}) {
  const direction = transferDirection(transfer, viewer);
  const counterpart = direction === "received" ? transfer.from : transfer.to;

  return (
    <Link
      href={`/wallet/transactions/${encodeURIComponent(transfer.id)}`}
      className="flex items-center gap-3 px-4 py-3 outline-offset-[-2px] transition-colors hover:bg-fg/[0.03]"
    >
      {counterpart ? (
        <Avatar user={counterpart} />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xl text-brand"
        >
          <BsTwitter />
        </span>
      )}
      <span className="min-w-0 flex-1 leading-5">
        <span className="block truncate text-[15px]">
          {describeTransfer(transfer, viewer)}
        </span>
        <span className="flex items-center gap-2 text-[13px] text-muted">
          <LocalTime iso={transfer.createdAt} />
          {transfer.reversedBy ? (
            <Chip>Refunded</Chip>
          ) : (
            direction === "received" &&
            isPending(transfer, now) && <Chip>Pending</Chip>
          )}
        </span>
      </span>
      <Money
        amount={transfer.amount}
        direction={direction}
        className="shrink-0 text-[15px] font-bold"
      />
    </Link>
  );
}

/**
 * A wallet's transfers grouped by day, each row a link to its receipt.
 * More pages load when the end scrolls into view, with a "Show more"
 * button as the fallback (and for keyboard users), like Timeline.
 */
export default function TransferList({
  transfers,
  viewer,
  hasMore,
  loading,
  error,
  onLoadMore,
  empty,
}: TransferListProps) {
  const hydrated = useHydrated();
  const [now] = useState(() => Date.now());
  const sentinel = useRef<HTMLDivElement>(null);
  const load = useRef(onLoadMore);

  useEffect(() => {
    load.current = onLoadMore;
  });

  useEffect(() => {
    const element = sentinel.current;
    if (
      !element ||
      !hasMore ||
      error ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) load.current();
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, error]);

  if (transfers.length === 0 && !hasMore) return <>{empty}</>;

  const groups = groupByDay(transfers, now, hydrated ? undefined : "UTC");

  return (
    <div>
      {groups.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h3 className="px-4 pb-1 pt-4 text-[15px] font-bold text-muted">
            {group.label}
          </h3>
          <ul>
            {group.items.map((transfer) => (
              <li key={transfer.id}>
                <TransferRow transfer={transfer} viewer={viewer} now={now} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div ref={sentinel} aria-busy={loading}>
        {error ? (
          <div
            role="alert"
            className="flex flex-col items-center gap-3 p-6 text-[15px] text-muted"
          >
            <p>{error}</p>
            <Button onClick={onLoadMore}>Retry</Button>
          </div>
        ) : (
          (hasMore || loading) && (
            <button
              type="button"
              aria-disabled={loading}
              onClick={() => !loading && onLoadMore()}
              className="flex w-full justify-center p-4 text-[15px] text-primary transition-colors hover:bg-fg/[0.03] aria-disabled:cursor-progress"
            >
              {loading ? (
                <>
                  <span
                    aria-hidden="true"
                    className="h-7 w-7 animate-spin rounded-full border-[3px] border-primary/25 border-t-primary"
                  />
                  <span className="sr-only">Loading more activity</span>
                </>
              ) : (
                "Show more"
              )}
            </button>
          )
        )}
      </div>
    </div>
  );
}
