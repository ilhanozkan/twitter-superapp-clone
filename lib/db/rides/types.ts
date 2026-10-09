import { Cents } from "../../../types/Money";
import { IPage } from "../../../types/Page";
import { IDriver, IRide, IRideQuote, RideType } from "../../../types/Ride";
import { PlaceId } from "../../../types/Superapp";
import { IAuthor } from "../../../types/User";
import {
  FeatureRepository,
  IdempotentInput,
  MoneyResult,
  PageQuery,
} from "../types";

// Skeleton declared by the foundation; the rides lane implements it.

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
