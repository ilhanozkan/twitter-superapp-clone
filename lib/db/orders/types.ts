import { Cents } from "../../../types/Money";
import { IOrder } from "../../../types/Order";
import { IPage } from "../../../types/Page";
import { PlaceId } from "../../../types/Superapp";
import { IAuthor } from "../../../types/User";
import {
  FeatureRepository,
  IdempotentInput,
  MoneyResult,
  PageQuery,
} from "../types";

// Skeleton declared by the foundation; the orders lane implements it.

export interface NewOrder extends IdempotentInput {
  buyer: IAuthor;
  business: string;
  lines: { productId: string; quantity: number }[];
  deliveryPlaceId: PlaceId;
  note: string | null;
  expectedTotal: Cents;
  sourceTweetId: string | null;
}

export interface DemoOrderInput extends IdempotentInput {
  business: string;
  requestedBy: IAuthor;
}

export interface OrdersRepository extends FeatureRepository {
  /** UnavailableError (closed, paused, frozen, sold out, below minimum; productIds), PriceChangedError,
   *  InsufficientFundsError, LimitExceededError (> 200.00, > 5 active orders; exact via buyer lock), InvalidStateError (own business). */
  placeOrder(input: NewOrder): Promise<MoneyResult & { order: IOrder }>;
  /** One commit: issue the total to demo_customer ("Demo bot funding") + its order payment.
   *  Products: 1–2 available ones chosen by hash(operationId); delivery place by hash, not the business's place. */
  placeDemoOrder(
    input: DemoOrderInput
  ): Promise<{ order: IOrder; replayed: boolean }>;
  getOrder(id: string): Promise<IOrder | null>;
  listOrders(
    query: {
      buyer?: string;
      business?: string;
      state?: "active" | "past";
    } & PageQuery
  ): Promise<IPage<IOrder>>;
  /** Idempotent by target state; refund transfer refund-<paymentTransferId> reverses the held payment;
   *  InvalidStateError outside the window for `as` (buyer: before acceptAt; business: before deliverAt). */
  cancelOrder(input: {
    id: string;
    as: "buyer" | "business";
  }): Promise<{ order: IOrder; changed: boolean }>;
  businessSummary(
    business: string,
    since: string
  ): Promise<{
    orders: number;
    revenue: Cents;
    pending: Cents;
    fromTweets: number;
  }>;
}
