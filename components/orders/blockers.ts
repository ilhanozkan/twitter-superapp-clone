import { ApiRequestError } from "../../lib/client/api";
import { LIMITS } from "../../lib/superapp/limits";
import { formatCredits } from "../../lib/superapp/money";
import { OrderPrice } from "../../lib/superapp/orders";
import { IBusiness } from "../../types/Business";
import { Cents } from "../../types/Money";
import { READ_ONLY_ORDERING } from "../shop/format";

export interface Blocker {
  message: string;
  /** Not enough credits: the UI offers Add credits. */
  funds?: boolean;
}

/**
 * Why an order can't be paid as it stands, checked in the order the server
 * checks it, or null when it can. Shown next to a disabled Pay / Place
 * order, so nothing is sent that the server is sure to refuse.
 */
export function orderBlocker({
  readOnly,
  business,
  unavailable,
  removable = false,
  price,
  available,
}: {
  readOnly: boolean;
  business: Pick<IBusiness, "fullname" | "status" | "minimumOrder">;
  /** Items that are sold out, or gone from the menu. */
  unavailable: { name: string; gone: boolean }[];
  /** Checkout can drop items; the quick order sheet has only the one. */
  removable?: boolean;
  price: OrderPrice;
  /** The viewer's available credits, when known. */
  available: Cents | null;
}): Blocker | null {
  if (readOnly) return { message: `${READ_ONLY_ORDERING}.` };
  if (!business.status.orderable) {
    return { message: `${business.fullname}: ${business.status.label}` };
  }
  if (unavailable.length > 0) {
    const [first] = unavailable;
    const what =
      unavailable.length > 1
        ? "Some items are sold out or no longer available."
        : `${first.name} ${first.gone ? "is no longer available" : "is sold out"}.`;
    const hint = unavailable.length > 1 ? "Remove them" : "Remove it";
    return { message: removable ? `${what} ${hint} to order.` : what };
  }
  if (price.belowMinimum > 0) {
    return {
      message: `The minimum order at ${business.fullname} is ${formatCredits(business.minimumOrder)}. Add ${formatCredits(price.belowMinimum)} more.`,
    };
  }
  if (price.overMaximum) {
    return {
      message: `An order can be up to ${formatCredits(LIMITS.order.maxTotal)}.`,
    };
  }
  if (available !== null && price.total > available) {
    return {
      message: `You have ${formatCredits(available)} available.`,
      funds: true,
    };
  }
  return null;
}

/**
 * The products a 422 `unavailable` names (sold out, or gone from the
 * menu), from the error's details. Empty when it isn't one, or when the
 * refusal is about the business itself (closed, paused, the minimum).
 */
export function unavailableProducts(error: unknown): string[] {
  if (!(error instanceof ApiRequestError) || error.code !== "unavailable") {
    return [];
  }
  return (error.details ?? [])
    .filter((detail) => detail.path === "productId")
    .map((detail) => detail.message);
}
