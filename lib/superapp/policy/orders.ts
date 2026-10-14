import { IBusiness } from "../../../types/Business";
import { IOrder } from "../../../types/Order";
import { canManageBusiness } from "./business";

// Who may see or cancel an order: its buyer, and the people who run its
// business (the account itself and its managers). The API answers 404 to
// everyone else, so order ids reveal nothing.

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The business as read now, or null when it is gone: then only the account itself runs it. */
type OrderBusiness = Pick<IBusiness, "username" | "managers"> | null;

const runs = (
  viewer: string,
  order: Pick<IOrder, "business">,
  business: OrderBusiness
) =>
  canManageBusiness(
    viewer,
    business ?? { username: order.business.username, managers: [] }
  );

export function canViewOrder(
  viewer: string,
  order: Pick<IOrder, "buyer" | "business">,
  business: OrderBusiness
): boolean {
  return same(viewer, order.buyer.username) || runs(viewer, order, business);
}

/** The buyer cancels as the buyer; the business's people cancel as the business. */
export function canCancelOrder(
  viewer: string,
  order: Pick<IOrder, "buyer" | "business">,
  business: OrderBusiness,
  as: "buyer" | "business"
): boolean {
  return as === "buyer"
    ? same(viewer, order.buyer.username)
    : runs(viewer, order, business);
}
