import { BusinessCategory } from "../../types/Business";
import {
  BusinessMenuResponse,
  BusinessResponse,
  BusinessSummariesResponse,
  ProductDetailResponse,
  ProductResponse,
  ProductsResponse,
} from "../../types/Shop";
import { request } from "./request";

// The business and product endpoints (docs/api/shop.md). None moves money,
// so none takes an Idempotency-Key: the switches set a state, and repeating
// them is harmless.

const json = (body: unknown) => JSON.stringify(body);
const id = (value: string) => encodeURIComponent(value);

export const shopApi = {
  /** The Food hub: every business with its status and top items. */
  listBusinesses(category?: BusinessCategory) {
    const search = category ? `?category=${id(category)}` : "";
    return request<BusinessSummariesResponse>(`/api/businesses${search}`);
  },

  getBusiness(username: string) {
    return request<BusinessMenuResponse>(`/api/businesses/${id(username)}`);
  },

  /** Managers only. */
  setAcceptingOrders(username: string, acceptingOrders: boolean) {
    return request<BusinessResponse>(
      `/api/businesses/${id(username)}/settings`,
      { method: "PUT", body: json({ acceptingOrders }) }
    );
  },

  getProduct(productId: string) {
    return request<ProductDetailResponse>(`/api/products/${id(productId)}`);
  },

  /** Managers only: false marks it sold out. */
  setAvailability(productId: string, available: boolean) {
    return request<ProductResponse>(
      `/api/products/${id(productId)}/availability`,
      { method: "PUT", body: json({ available }) }
    );
  },

  /** What the composer's picker suggests to the current user. */
  listAttachable() {
    return request<ProductsResponse>("/api/products/attachable");
  },
};
