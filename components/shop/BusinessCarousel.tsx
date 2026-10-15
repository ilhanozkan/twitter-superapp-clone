import Link from "next/link";
import { useEffect, useState } from "react";

import { shopApi } from "../../lib/client/shopApi";
import { useAppSelector } from "../../store";
import { IBusinessSummary } from "../../types/Shop";
import Avatar from "../common/Avatar";
import { revealFocusedItem } from "../common/revealFocusedItem";
import { etaText, shortStatus } from "./format";
import { FOOD_PATH, menuPath } from "./paths";

type Load =
  | { state: "loading" }
  | { state: "loaded"; items: IBusinessSummary[] }
  | { state: "failed" };

/**
 * Slot (§12.3) on Services: "Order from", a row of businesses that scrolls
 * sideways. It is a native list of links, so the keyboard reaches every
 * one. Services is the feature's launcher, not its only door, so a failed
 * load hides the row (the Food tile and /food still work).
 */
export default function BusinessCarousel() {
  const shopOn = useAppSelector((state) => state.session.features.shop);
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    if (!shopOn) return;
    let cancelled = false;
    shopApi.listBusinesses().then(
      ({ items }) => {
        if (!cancelled) setLoad({ state: "loaded", items });
      },
      () => {
        if (!cancelled) setLoad({ state: "failed" });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [shopOn]);

  if (!shopOn || load.state === "failed") return null;
  if (load.state === "loaded" && load.items.length === 0) return null;

  return (
    <section
      aria-labelledby="order-from"
      aria-busy={load.state === "loading"}
      className="flex min-w-0 flex-col gap-3"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="order-from" className="text-xl font-extrabold">
          Order from
        </h2>
        <Link
          href={FOOD_PATH}
          className="text-[15px] text-primary hover:underline"
        >
          See all
        </Link>
      </div>
      {load.state === "loading" ? (
        // Holds the row's height so the page doesn't jump when it arrives.
        <div aria-hidden="true" className="h-[148px] rounded-2xl bg-subtle" />
      ) : (
        <ul
          onFocus={revealFocusedItem}
          className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2"
        >
          {load.items.map((business) => (
            <li key={business.username} className="w-40 shrink-0 snap-start">
              <Link
                href={menuPath(business.username)}
                className="flex h-full flex-col gap-2 rounded-2xl border border-line p-3 transition-colors hover:bg-fg/[0.03]"
              >
                <Avatar user={business} size={48} />
                <h3 className="truncate text-[15px] font-bold leading-5">
                  {business.fullname}
                </h3>
                <p className="text-[13px] leading-4 text-muted">
                  {shortStatus(business.status)}
                  <br />
                  <span className="tabular-nums">
                    {etaText(business.etaMinutes)}
                  </span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
