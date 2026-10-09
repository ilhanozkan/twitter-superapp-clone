import {
  HiOutlineClock,
  HiOutlineMoon,
  HiOutlinePauseCircle,
} from "react-icons/hi2";

import { IBusinessStatus } from "../../types/Business";

/**
 * Whether a business is open, as an icon and text ("Open now · Closes
 * 02:00", "Closed · Opens 11:00", "Not taking orders right now"): never
 * colour alone.
 */
export default function BusinessStatus({
  status,
  id,
  className = "",
}: {
  status: IBusinessStatus;
  id?: string;
  className?: string;
}) {
  const Icon = status.orderable
    ? HiOutlineClock
    : status.reason === "closed"
      ? HiOutlineMoon
      : HiOutlinePauseCircle;
  return (
    <span id={id} className={`flex min-w-0 items-center gap-1 ${className}`}>
      <Icon
        aria-hidden="true"
        className={`shrink-0 text-lg ${status.orderable ? "text-success" : ""}`}
      />
      <span className="min-w-0">{status.label}</span>
    </span>
  );
}
