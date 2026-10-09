import { useId } from "react";

import { shopApi } from "../../lib/client/shopApi";
import { IProduct } from "../../types/Shop";
import Money from "../superapp/Money";
import AvailabilitySwitch from "./AvailabilitySwitch";
import ProductThumb from "./ProductThumb";
import { useSwitchSetting } from "./useSwitchSetting";

/**
 * A product on the Business page's Menu tab: its availability switch,
 * named by the product. Off is "Sold out": still on the menu, but it can't
 * be ordered or attached to new Tweets.
 */
export default function ProductAvailability({
  product,
  disabled = false,
  reasonId,
}: {
  product: IProduct;
  /** Read-only demo: the switch shows but can't move, for the reason `reasonId` states. */
  disabled?: boolean;
  reasonId?: string;
}) {
  const nameId = useId();
  const { value, busy, change } = useSwitchSetting(
    product.available,
    async (available) =>
      (await shopApi.setAvailability(product.id, available)).product.available
  );

  return (
    <div className="flex items-center gap-3 px-4 py-3 text-[15px] leading-5">
      <ProductThumb image={product.image} alt={null} size={48} />
      <div className="min-w-0 flex-1">
        <p id={nameId} className="font-bold [overflow-wrap:anywhere]">
          {product.name}
        </p>
        <p className="text-muted">
          <Money amount={product.price} /> · {value ? "Available" : "Sold out"}
        </p>
      </div>
      <AvailabilitySwitch
        checked={value}
        onChange={change}
        labelledBy={nameId}
        describedBy={disabled && reasonId ? reasonId : undefined}
        disabled={disabled}
        busy={busy}
      />
    </div>
  );
}
