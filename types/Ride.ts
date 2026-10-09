import { Cents } from "./Money";
import { IPlace, IStage } from "./Superapp";
import { IAuthor } from "./User";

// Skeleton declared by the foundation; the rides lane completes it.

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
  eta: string | null;
  nextChangeAt: string | null;
  /** 0..1 */
  progress: { leg: "pickup" | "trip" | null; fraction: number };
  canCancel: boolean;
}
