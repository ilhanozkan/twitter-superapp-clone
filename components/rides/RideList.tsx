import Link from "next/link";
import { ReactNode, useEffect, useRef, useState } from "react";
import { HiChevronRight } from "react-icons/hi2";
import { RiCarLine } from "react-icons/ri";

import { errorMessage } from "../../lib/client/api";
import { ridesApi } from "../../lib/client/ridesApi";
import { IRide, RidePageResponse } from "../../types/Ride";
import { Button } from "../common/Button";
import LocalTime from "../superapp/LocalTime";
import Money from "../superapp/Money";
import { RideRole, rideListStatus } from "./rideText";

interface RideListProps {
  title: string;
  /** The first page, read on the server. */
  initial: RidePageResponse;
  role: RideRole;
  empty: ReactNode;
}

function RideRow({ ride, role }: { ride: IRide; role: RideRole }) {
  return (
    <Link
      href={`/rides/${encodeURIComponent(ride.id)}`}
      className="flex items-center gap-3 px-4 py-3 outline-offset-[-2px] transition-colors hover:bg-fg/[0.03]"
    >
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl text-primary"
      >
        <RiCarLine />
      </span>
      {/* Rows wrap on narrow screens: the route, status and date tell them apart. */}
      <span className="min-w-0 flex-1 leading-5 [overflow-wrap:anywhere]">
        <span className="block font-bold">
          {ride.from.name} <span aria-hidden="true">→</span>
          <span className="sr-only">to</span> {ride.to.name}
        </span>
        <span className="block text-[13px] text-muted">
          {role === "driver" && `${ride.rider.fullname} · `}
          {rideListStatus(ride)} ·{" "}
          <LocalTime iso={ride.requestedAt} format="date" />
        </span>
      </span>
      <Money amount={ride.fare} className="shrink-0 text-[15px]" />
      <HiChevronRight aria-hidden="true" className="shrink-0 text-muted" />
    </Link>
  );
}

/** Rides as links to their pages, newest first, with "Show more". */
export default function RideList({
  title,
  initial,
  role,
  empty,
}: RideListProps) {
  const [page, setPage] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingId = `rides-${role}-heading`;
  const list = useRef<HTMLUListElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  // After "Show more", focus moves to the first new row (like Timeline).
  const focusRow = useRef<number | null>(null);

  useEffect(() => {
    if (focusRow.current === null) return;
    list.current?.querySelectorAll("a")[focusRow.current]?.focus();
    focusRow.current = null;
  }, [page]);

  const loadMore = async () => {
    if (loading || !page.nextCursor) return;
    setLoading(true);
    setError(null);
    try {
      const next = await ridesApi.list(role, { cursor: page.nextCursor });
      if (document.activeElement === more.current) {
        focusRow.current = page.items.length;
      }
      setPage((current) => ({
        ...next,
        items: [...current.items, ...next.items],
      }));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section aria-labelledby={headingId} className="border-t border-line">
      <h2 id={headingId} className="px-4 pt-4 text-xl font-extrabold">
        {title}
      </h2>
      {page.items.length === 0 ? (
        <div className="px-4 py-6 text-[15px] text-muted">{empty}</div>
      ) : (
        <ul ref={list} className="mt-2">
          {page.items.map((ride) => (
            <li key={ride.id}>
              <RideRow ride={ride} role={role} />
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="px-4 pt-2 text-[15px] text-danger">
          {error}
        </p>
      )}
      {page.nextCursor && (
        <div className="px-4 py-3">
          <Button
            ref={more}
            variant="outline"
            onClick={loadMore}
            aria-busy={loading}
            aria-disabled={loading}
          >
            {error ? "Retry" : "Show more"}
          </Button>
        </div>
      )}
    </section>
  );
}
