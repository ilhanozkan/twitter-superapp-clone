import {
  BusinessSummaryResponse,
  NewOrderBody,
  OrderMoneyResponse,
  OrderPageResponse,
  OrderResponse,
} from "../../types/Order";
import { request } from "./request";

// The orders endpoints (docs/api/orders.md). Placing an order and the demo
// bot move money, so they take the Idempotency-Key the caller keeps for
// that operation (useIdempotencyKey); cancelling is idempotent by state and
// takes none.

const json = (body: unknown) => JSON.stringify(body);
const id = (value: string) => encodeURIComponent(value);

function query(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      search.set(name, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export interface OrdersQuery {
  as?: "buyer" | "business";
  business?: string;
  state?: "active" | "past";
  limit?: number;
  cursor?: string | null;
}

export const ordersApi = {
  /** Price the cart with `priceOrder` first: `expectedTotal` must match the server's. */
  placeOrder(body: NewOrderBody, idempotencyKey: string) {
    return request<OrderMoneyResponse>("/api/orders", {
      method: "POST",
      body: json(body),
      idempotencyKey,
    });
  },

  listOrders(params: OrdersQuery = {}) {
    return request<OrderPageResponse>(`/api/orders${query({ ...params })}`);
  },

  getOrder(orderId: string) {
    return request<OrderResponse>(`/api/orders/${id(orderId)}`);
  },

  /** The buyer before the business accepts; the business until delivery. */
  cancelOrder(orderId: string, as: "buyer" | "business") {
    return request<OrderMoneyResponse>(`/api/orders/${id(orderId)}/cancel`, {
      method: "POST",
      body: json({ as }),
    });
  },

  /** Managers only: "Simulate a customer order · Demo bot". */
  simulateOrder(business: string, idempotencyKey: string) {
    return request<OrderResponse>(
      `/api/businesses/${id(business)}/demo-orders`,
      { method: "POST", idempotencyKey }
    );
  },

  /** Managers only: today's orders and the business's wallet. */
  getSummary(business: string, since?: string) {
    return request<BusinessSummaryResponse>(
      `/api/businesses/${id(business)}/summary${query({ since })}`
    );
  },
};
