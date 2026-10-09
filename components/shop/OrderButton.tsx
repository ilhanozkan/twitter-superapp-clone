import { useAppSelector } from "../../store";
import { IBusiness } from "../../types/Business";
import { ButtonLink } from "../common/Button";
import { menuPath } from "./paths";

/**
 * Slot (§12.3): the primary "Order" button on a business profile, leading
 * to its Menu tab. Shown while the shop is on, like the tab.
 */
export default function OrderButton({ business }: { business: IBusiness }) {
  const shopOn = useAppSelector((state) => state.session.features.shop);
  if (!shopOn) return null;
  return <ButtonLink href={menuPath(business.username)}>Order</ButtonLink>;
}
