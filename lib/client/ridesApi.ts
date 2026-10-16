import { MoneyResponse } from "../../types/Api";
import { Cents } from "../../types/Money";
import {
  RideMoneyResponse,
  RidePageResponse,
  RideQuoteResponse,
  RideResponse,
  RideType,
} from "../../types/Ride";
import { PlaceId } from "../../types/Superapp";
import { request } from "./request";

// The rides endpoints (docs/api/rides.md). Booking and tipping move money,
// so they take the Idempotency-Key the caller keeps for that operation
// (useIdempotencyKey): a retry can never book or tip twice.

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

export interface BookRideBody {
  from: PlaceId;
  to: PlaceId;
  type: RideType;
  /** The fare from the quote; a stale one answers 409 price_changed. */
  expectedFare: Cents;
}

export const ridesApi = {
  quote(from: PlaceId, to: PlaceId) {
    return request<RideQuoteResponse>(`/api/rides/quote${query({ from, to })}`);
  },

  book(body: BookRideBody, idempotencyKey: string) {
    return request<RideMoneyResponse>("/api/rides", {
      method: "POST",
      body: json(body),
      idempotencyKey,
    });
  },

  /** Your trips as the rider, or as the driver for a driver account. */
  list(
    as: "rider" | "driver" = "rider",
    page: { limit?: number; cursor?: string | null } = {}
  ) {
    return request<RidePageResponse>(`/api/rides${query({ as, ...page })}`);
  },

  get(rideId: string) {
    return request<RideResponse>(`/api/rides/${id(rideId)}`);
  },

  /** Before pickup only; repeating it is harmless. */
  cancel(rideId: string) {
    return request<RideMoneyResponse>(`/api/rides/${id(rideId)}/cancel`, {
      method: "POST",
    });
  },

  /** Once the ride is complete. */
  tip(rideId: string, amount: Cents, idempotencyKey: string) {
    return request<MoneyResponse>(`/api/rides/${id(rideId)}/tip`, {
      method: "POST",
      body: json({ amount }),
      idempotencyKey,
    });
  },
};
