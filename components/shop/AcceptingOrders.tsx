import { useId, useState } from "react";

import { shopApi } from "../../lib/client/shopApi";
import { IBusiness } from "../../types/Business";
import AvailabilitySwitch from "./AvailabilitySwitch";
import BusinessStatus from "./BusinessStatus";
import { useSwitchSetting } from "./useSwitchSetting";

/**
 * The "Accepting orders" switch with the business's status, which follows
 * it ("Not taking orders right now" while paused).
 */
export default function AcceptingOrders({
  business,
  disabled = false,
  reasonId,
}: {
  business: IBusiness;
  disabled?: boolean;
  reasonId?: string;
}) {
  const labelId = useId();
  const [status, setStatus] = useState(business.status);
  const { value, busy, change } = useSwitchSetting(
    business.acceptingOrders,
    async (acceptingOrders) => {
      const saved = await shopApi.setAcceptingOrders(
        business.username,
        acceptingOrders
      );
      setStatus(saved.business.status);
      return saved.business.acceptingOrders;
    }
  );

  return (
    <div className="flex items-center justify-between gap-3 text-[15px] leading-5">
      <div className="min-w-0">
        <p id={labelId} className="font-bold">
          Accepting orders
        </p>
        {/* Polite: the status changes with the switch, away from focus. */}
        <div aria-live="polite" className="mt-1 text-muted">
          <BusinessStatus status={status} />
        </div>
      </div>
      <AvailabilitySwitch
        checked={value}
        onChange={change}
        labelledBy={labelId}
        describedBy={disabled && reasonId ? reasonId : undefined}
        disabled={disabled}
        busy={busy}
      />
    </div>
  );
}
