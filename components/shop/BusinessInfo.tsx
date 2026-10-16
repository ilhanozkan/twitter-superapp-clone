import { HiOutlineMapPin, HiOutlineTruck } from "react-icons/hi2";

import { useAppSelector } from "../../store";
import { IBusiness } from "../../types/Business";
import BusinessStatus from "./BusinessStatus";
import { deliveryText } from "./format";

/**
 * Slot (§12.3) on a business profile: whether it is open, the delivery
 * estimate and fee, and the address (the profile adds "Ride here" after
 * it). Ordering details mean nothing while the shop is off, so it shows
 * only while it is on.
 */
export default function BusinessInfo({ business }: { business: IBusiness }) {
  const shopOn = useAppSelector((state) => state.session.features.shop);
  if (!shopOn) return null;

  return (
    <>
      <BusinessStatus status={business.status} />
      <p className="flex items-center gap-1">
        <HiOutlineTruck aria-hidden="true" className="shrink-0 text-lg" />
        <span className="min-w-0 tabular-nums">{deliveryText(business)}</span>
      </p>
      <p className="flex items-center gap-1">
        <HiOutlineMapPin aria-hidden="true" className="shrink-0 text-lg" />
        <span className="min-w-0 [overflow-wrap:anywhere]">
          {business.address}
        </span>
      </p>
    </>
  );
}
