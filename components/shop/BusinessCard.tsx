import Link from "next/link";
import { HiOutlineTruck } from "react-icons/hi2";

import { CATEGORY_LABELS } from "../../lib/superapp/shop";
import { IBusinessSummary } from "../../types/Shop";
import Avatar from "../common/Avatar";
import BusinessStatus from "./BusinessStatus";
import { etaText, feeText } from "./format";
import { menuPath } from "./paths";

/**
 * A business on the Food hub: one link to its menu, holding its banner,
 * name (an h2), category, open state, delivery estimate and fee, and its
 * top items.
 */
export default function BusinessCard({
  business,
}: {
  business: IBusinessSummary;
}) {
  return (
    <Link
      href={menuPath(business.username)}
      className="block overflow-hidden rounded-2xl border border-line transition-colors hover:bg-fg/[0.03]"
    >
      <div className="aspect-[3/1] w-full bg-banner">
        {business.banner && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={business.banner}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="flex gap-3 p-3">
        <Avatar
          user={business}
          size={48}
          className="-mt-8 border-2 border-surface"
        />
        <div className="min-w-0 flex-1 text-[15px]">
          <h2 className="truncate text-[17px] font-bold leading-6">
            {business.fullname}
          </h2>
          <p className="text-muted">{CATEGORY_LABELS[business.category]}</p>
          <div className="mt-1 flex flex-col gap-0.5 text-muted">
            <BusinessStatus status={business.status} />
            <p className="flex items-center gap-1 tabular-nums">
              <HiOutlineTruck aria-hidden="true" className="shrink-0 text-lg" />
              <span className="min-w-0">
                {etaText(business.etaMinutes)} · {feeText(business.deliveryFee)}
              </span>
            </p>
          </div>
          {business.highlights.length > 0 && (
            <p className="mt-2 truncate">
              <span className="sr-only">Top items: </span>
              {business.highlights.join(" · ")}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
