import { formatAmount, formatCredits } from "../../lib/superapp/money";
import { IBusiness, IBusinessStatus } from "../../types/Business";
import { Cents } from "../../types/Money";
import { IProductCard } from "../../types/Shop";

// The shop's wording, in one place so cards, menus and the profile say the
// same thing.

/** "9–12 min" */
export const etaText = ([from, to]: [number, number]) => `${from}–${to} min`;

/** "Open" while it takes orders, else why not: "Closed · Opens 11:00", "Not taking orders right now". */
export const shortStatus = (status: IBusinessStatus) =>
  status.orderable ? "Open" : status.label;

/** A product card's business line: "Kızılay Kahve · Open · 9–12 min". */
export const cardBusinessLine = ({ business }: IProductCard) =>
  `${business.fullname} · ${shortStatus(business.status)} · ${etaText(business.etaMinutes)}`;

/** "1.50 credits fee", or "Free delivery". */
export const feeText = (fee: Cents) =>
  fee > 0 ? `${formatCredits(fee)} fee` : "Free delivery";

/** "Delivery 9–12 min · 1.50 credits fee · Min. 3.00" */
export function deliveryText(
  business: Pick<IBusiness, "etaMinutes" | "deliveryFee" | "minimumOrder">
): string {
  return [
    `Delivery ${etaText(business.etaMinutes)}`,
    feeText(business.deliveryFee),
    ...(business.minimumOrder > 0
      ? [`Min. ${formatAmount(business.minimumOrder)}`]
      : []),
  ].join(" · ");
}

/** "3 items · 14.50 credits" */
export const cartText = (count: number, subtotal: Cents) =>
  `${count} ${count === 1 ? "item" : "items"} · ${formatCredits(subtotal)}`;

/** Why ordering is off on a read-only deployment (§4.8). */
export const READ_ONLY_ORDERING =
  "Ordering is turned off on this read-only demo";
