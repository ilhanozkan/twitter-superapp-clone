import { Cents } from "../../../types/Money";
import { IPage } from "../../../types/Page";
import {
  IDriver,
  IRide,
  IRideQuote,
  IVehicle,
  RideType,
} from "../../../types/Ride";
import { PlaceId } from "../../../types/Superapp";
import { IAuthor } from "../../../types/User";
import {
  FeatureRepository,
  IdempotentInput,
  MoneyResult,
  PageQuery,
} from "../types";

export interface NewRide extends IdempotentInput {
  rider: IAuthor;
  from: PlaceId;
  to: PlaceId;
  type: RideType;
  expectedFare: Cents;
}

export interface RidesRepository extends FeatureRepository {
  quote(
    from: PlaceId,
    to: PlaceId
  ): Promise<{ quotes: IRideQuote[]; distanceKm: number; tripMinutes: number }>;
  /** UnavailableError (no free driver of the type), PriceChangedError, InvalidStateError (active ride; exact via rider lock),
   *  InsufficientFundsError. The driver lock prevents double assignment. */
  bookRide(input: NewRide): Promise<MoneyResult & { ride: IRide }>;
  getRide(id: string): Promise<IRide | null>;
  listRides(
    query: { rider?: string; driver?: string } & PageQuery
  ): Promise<IPage<IRide>>;
  /** Idempotent by target state; refund-<paymentTransferId>; InvalidStateError at or after pickupAt. Releases the driver lock. */
  cancelRide(input: { id: string }): Promise<{ ride: IRide; changed: boolean }>;
  getDriver(username: string): Promise<IDriver | null>;
}

/**
 * A driver as stored: everything in IDriver except the name and avatar,
 * which always come from the user record. Inactive drivers are never matched.
 */
export interface DriverProfile {
  username: string;
  vehicle: IVehicle;
  rideType: RideType;
  seats: number;
  active: boolean;
}

/** A ride as stored: the schedule fixed at booking, with snapshots of both people. */
export interface StoredRide {
  id: string;
  code: string;
  rider: IAuthor;
  driver: IDriver;
  from: PlaceId;
  to: PlaceId;
  type: RideType;
  fare: Cents;
  distanceKm: number;
  requestedAt: string;
  driverAssignedAt: string;
  pickupAt: string;
  dropoffAt: string;
  cancelledAt: string | null;
  paymentTransferId: string;
  refundTransferId: string | null;
  /** Fingerprint of the booking request; null for seeds. */
  requestHash: string | null;
}
