import { Cents } from "./Money";
import { IPage } from "./Page";
import { IPlace, IStage } from "./Superapp";
import { IAuthor } from "./User";
import { IWallet } from "./Wallet";

// Trips with a driver. A ride stores its schedule (absolute times fixed at
// booking); its status, stages, ETA and progress are derived from that
// schedule and the server's clock on every read (lib/superapp/rides.ts).

export type RideType = "economy" | "comfort" | "xl";

export type RideStatus =
  "finding" | "arriving" | "on_trip" | "completed" | "cancelled";

export interface IVehicle {
  make: string;
  model: string;
  color: string;
  plate: string;
}

export interface IDriver extends IAuthor {
  vehicle: IVehicle;
  rideType: RideType;
  seats: number;
}

export interface IRideQuote {
  type: RideType;
  label: string;
  seats: number;
  fare: Cents;
  pickupMinutes: number | null;
  available: boolean;
}

export interface IRide {
  id: string;
  code: string;
  rider: IAuthor;
  driver: IDriver;
  from: IPlace;
  to: IPlace;
  type: RideType;
  fare: Cents;
  distanceKm: number;
  // Stored schedule.
  requestedAt: string;
  driverAssignedAt: string;
  pickupAt: string;
  dropoffAt: string;
  cancelledAt: string | null;
  paymentTransferId: string;
  refundTransferId: string | null;
  // Derived.
  status: RideStatus;
  stages: IStage<RideStatus>[];
  /** When the rider next arrives somewhere: pickup until then, the destination on the trip. */
  eta: string | null;
  nextChangeAt: string | null;
  /** How far the car is along the current leg, 0..1. */
  progress: { leg: "pickup" | "trip" | null; fraction: number };
  /** The rider may cancel (with a full refund) until pickup. */
  canCancel: boolean;
}

// Response bodies of the rides API (docs/api/rides.md).

export interface RideQuoteResponse {
  /** One per ride type, in RIDE_TYPES order. */
  quotes: IRideQuote[];
  distanceKm: number;
  tripMinutes: number;
}

/** A time-derived ride, with the server's clock it was derived at. */
export interface RideResponse {
  ride: IRide;
  serverNow: string;
}

/** A booking or a cancellation: the ride and the acting user's wallet afterwards. */
export interface RideMoneyResponse extends RideResponse {
  wallet: IWallet;
}

export interface RidePageResponse extends IPage<IRide> {
  serverNow: string;
}
