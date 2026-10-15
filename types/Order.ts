import { BusinessCategory } from "./Business";
import { Cents } from "./Money";
import { IPlace, IStage } from "./Superapp";
import { IAuthor } from "./User";

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
