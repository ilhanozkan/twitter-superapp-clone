import { BusinessCategory } from "./Business";
import { Cents } from "./Money";
import { IPage } from "./Page";
import { IPlace, IStage, PlaceId } from "./Superapp";
import { IAuthor } from "./User";
import { IWallet } from "./Wallet";

// Skeleton declared by the foundation; the orders lane completes it.

export type OrderStatus =
  "placed" | "accepted" | "on_the_way" | "delivered" | "cancelled";

export interface IOrderLine {
  productId: string;
  name: string;
  unitPrice: Cents;
  quantity: number;
  total: Cents;
}

export interface IOrder {
  id: string;
  /** "K7Q2" (display only) */
  code: string;
  buyer: IAuthor;
  placedBy: "buyer" | "demo_bot";
  business: IAuthor & { category: BusinessCategory };
  lines: IOrderLine[];
  subtotal: Cents;
  deliveryFee: Cents;
  total: Cents;
  deliveryPlace: IPlace;
  note: string | null;
  sourceTweetId: string | null;
  // Stored schedule.
  placedAt: string;
  acceptAt: string;
  onTheWayAt: string;
  deliverAt: string;
  cancelledAt: string | null;
  cancelledBy: "buyer" | "business" | null;
  paymentTransferId: string;
  refundTransferId: string | null;
  // Derived.
  status: OrderStatus;
  stages: IStage<OrderStatus>[];
  eta: string | null;
  nextChangeAt: string | null;
  /** Derived at now. */
  canCancel: { buyer: boolean; business: boolean };
}

// Response bodies of the orders endpoints (docs/api/orders.md). Every one
// carries `serverNow`: an order's stages are derived from the clock.

/** GET /api/orders/:id, POST /api/businesses/:username/demo-orders */
export interface OrderResponse {
  order: IOrder;
  serverNow: string;
}

/** POST /api/orders and POST /api/orders/:id/cancel: the acting user's wallet afterwards. */
export interface OrderMoneyResponse extends OrderResponse {
  wallet: IWallet;
}

/** GET /api/orders */
export interface OrderPageResponse extends IPage<IOrder> {
  serverNow: string;
}

/** A business's orders since a time: not cancelled, with what is still held. */
export interface IBusinessOrderSummary {
  orders: number;
  revenue: Cents;
  /** Totals of those orders not delivered yet: refundable, not spendable. */
  pending: Cents;
  /** Orders placed from a Tweet. */
  fromTweets: number;
}

/** GET /api/businesses/:username/summary: the Business board's header. */
export interface BusinessSummaryResponse {
  summary: IBusinessOrderSummary;
  /** The business's own wallet (Available · Pending). */
  wallet: IWallet;
  /** Where "today" starts in the business's time zone (or the `since` asked for). */
  since: string;
  serverNow: string;
}

/** The body of POST /api/orders. */
export interface NewOrderBody {
  business: string;
  items: { productId: string; quantity: number }[];
  deliveryPlaceId: PlaceId;
  note?: string | null;
  expectedTotal: Cents;
  sourceTweetId?: string | null;
}
