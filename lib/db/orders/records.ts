import { orderProgress } from "../../superapp/orders";
import { getPlace } from "../../superapp/places";
import { IOrder } from "../../../types/Order";
import { PlaceId } from "../../../types/Superapp";
import { IAuthor } from "../../../types/User";

// An order as both stores keep it: everything the buyer agreed to (snapshot
// lines and prices, the schedule) and nothing derived. Status, stages and
// the cancel windows are computed from the clock on every read.

export interface OrderRecord extends Omit<
  IOrder,
  "deliveryPlace" | "status" | "stages" | "eta" | "nextChangeAt" | "canCancel"
> {
  deliveryPlaceId: PlaceId;
  /** Fingerprint of the request that placed it (null for seeds). */
  requestHash: string | null;
}

/** The simulated customer of "Simulate a customer order · Demo bot" (F's seed account). */
export const DEMO_CUSTOMER: IAuthor = {
  username: "demo_customer",
  fullname: "Demo Customer (bot)",
  image: "/avatars/demo_customer.svg",
};

/** The payment's id: an operation's extra transfers are `<primary id>-<n>` (§6.5). */
export const paymentTransferId = (orderId: string) => `${orderId}-1`;

/** The demo bot's funding comes second in id, first in the ledger (credits before debits). */
export const fundingTransferId = (orderId: string) => `${orderId}-2`;

/** The refund's natural id: a payment can only ever be refunded once. */
export const refundTransferId = (paymentId: string) => `refund-${paymentId}`;

/** Cancelling takes no key; its refund is committed with this constant fingerprint, so a repeat replays. */
export const CANCEL_FINGERPRINT = "orders.cancel";

/** The API view of a stored order at `now`. */
export function toOrder(record: OrderRecord, now: Date): IOrder {
  const { deliveryPlaceId, requestHash, ...stored } = record;
  void requestHash;
  return {
    ...stored,
    buyer: { ...stored.buyer },
    business: { ...stored.business },
    lines: stored.lines.map((line) => ({ ...line })),
    deliveryPlace: { ...getPlace(deliveryPlaceId) },
    ...orderProgress(stored, now),
  };
}
