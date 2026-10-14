import { Cents } from "../../types/Money";
import { INotification } from "../../types/Notification";
import {
  IDriver,
  IRide,
  IRideQuote,
  RideStatus,
  RideType,
} from "../../types/Ride";
import { ILiveActivity, IPlace, PlaceId } from "../../types/Superapp";
import { IAuthor } from "../../types/User";
import {
  ForbiddenError,
  InvalidStateError,
  LimitExceededError,
  PriceChangedError,
  UnavailableError,
} from "../db/errors";
import type { NewRide, StoredRide } from "../db/rides/types";
import type { SendInput } from "../db/wallet/types";
import { distanceKm as roadDistanceKm } from "./geo";
import { PendingTransfer } from "./ledger";
import { LIMITS } from "./limits";
import { getPlace, isPlaceId } from "./places";
import { canTipRide } from "./policy/rides";
import { deriveStages, legProgress, StageSpec } from "./timeline";

// Ride rules both stores share, and the UI too (isomorphic: no Node APIs).
// Fares and times are pure functions of the two places; the driver and the
// pickup wait come from a hash of the booking's operation id, so a retried
// booking and both stores always agree. Progress is derived from the stored
// schedule and the clock, never written.

export const RIDE_TYPES: readonly RideType[] = ["economy", "comfort", "xl"];

/** Fares in cents: base + per km, rounded to 0.10 credits. */
export const RIDE_RATES: Record<
  RideType,
  { label: string; base: Cents; perKm: Cents; seats: number }
> = {
  economy: { label: "Economy", base: 200, perKm: 85, seats: 4 },
  comfort: { label: "Comfort", base: 300, perKm: 115, seats: 4 },
  xl: { label: "XL", base: 400, perKm: 140, seats: 6 },
};

/** The free cancel window lasts at least this long in real time, whatever the time scale. */
export const MIN_CANCEL_WINDOW_MS = 30_000;
/** Matching a driver takes at least this long in real time. */
const MIN_ASSIGN_MS = 3_000;
const ASSIGN_SECONDS = 10;
const PICKUP_MINUTES = { min: 2, max: 5 };
const TRIP_MINUTES = { min: 3, max: 12 };

const lower = (username: string) => username.toLowerCase();
const same = (a: string, b: string) => lower(a) === lower(b);

export const roundToTen = (cents: number): Cents => Math.round(cents / 10) * 10;

/** `round(perKm × km)` on tenths of a km, so float error can't move a fare. */
export function rideFare(type: RideType, distanceKm: number): Cents {
  const { base, perKm } = RIDE_RATES[type];
  const tenths = Math.round(distanceKm * 10);
  return roundToTen(base + Math.round((perKm * tenths) / 10));
}

export function tripMinutes(distanceKm: number): number {
  return Math.min(
    TRIP_MINUTES.max,
    Math.max(TRIP_MINUTES.min, Math.round(1.5 * distanceKm))
  );
}

export interface RideRoute {
  from: IPlace;
  to: IPlace;
  distanceKm: number;
  tripMinutes: number;
}

/** Throws (a bug in the caller: the API validates both places) for unknown or equal places. */
export function rideRoute(from: PlaceId, to: PlaceId): RideRoute {
  if (from === to) {
    throw new Error("Pickup and destination must be different places");
  }
  const pickup = getPlace(from);
  const destination = getPlace(to);
  const distanceKm = roadDistanceKm(pickup, destination);
  return {
    from: pickup,
    to: destination,
    distanceKm,
    tripMinutes: tripMinutes(distanceKm),
  };
}

/**
 * A small, stable 32-bit hash that runs the same everywhere: FNV-1a, then
 * murmur3's finalizer, because picks take it modulo small numbers and
 * FNV's low bits barely change between ids that differ only at the end.
 */
export function stableHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

const span = ({ min, max }: { min: number; max: number }, hash: number) =>
  min + (hash % (max - min + 1));

/** How far away the booked driver is: 2–5 minutes, fixed by the operation id. */
export function pickupMinutes(operationId: string): number {
  return span(PICKUP_MINUTES, stableHash(`${operationId}:pickup`));
}

/** What a quote shows before anyone books: 2–5 minutes, fixed per pickup place and type. */
export function quotedPickupMinutes(from: PlaceId, type: RideType): number {
  return span(PICKUP_MINUTES, stableHash(`${from}:${type}`));
}

/** Free drivers in a fixed order (by username), so every store picks alike. */
export function sortDrivers<T extends { username: string }>(drivers: T[]): T[] {
  return [...drivers].sort((a, b) =>
    lower(a.username) < lower(b.username)
      ? -1
      : lower(a.username) > lower(b.username)
        ? 1
        : 0
  );
}

/** `candidates[hash(operationId) % n]` over the sorted candidates; null when there are none. */
export function pickDriver<T extends { username: string }>(
  candidates: T[],
  operationId: string
): T | null {
  if (candidates.length === 0) return null;
  const sorted = sortDrivers(candidates);
  return sorted[stableHash(operationId) % sorted.length];
}

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** A short display code such as "R7K2" (no 0/O or 1/I); ids stay the identity. */
export function rideCode(id: string): string {
  let hash = stableHash(`${id}:code`);
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += CODE_ALPHABET[hash % CODE_ALPHABET.length];
    hash = Math.floor(hash / CODE_ALPHABET.length);
  }
  return code;
}

export interface RideSchedule {
  requestedAt: string;
  driverAssignedAt: string;
  pickupAt: string;
  dropoffAt: string;
}

/**
 * The stored schedule (§7). SUPERAPP_TIME_SCALE shortens demo trips, but
 * never below the real-time floors: matching takes at least 3 s and pickup
 * is at least 30 s after the request, which is the free cancel window.
 */
export function rideSchedule(
  requestedAt: Date,
  {
    pickupMinutes,
    tripMinutes,
    timeScale,
  }: { pickupMinutes: number; tripMinutes: number; timeScale: number }
): RideSchedule {
  const requested = requestedAt.getTime();
  const assigned =
    requested +
    Math.round(Math.max((ASSIGN_SECONDS * 1000) / timeScale, MIN_ASSIGN_MS));
  const pickup = Math.max(
    assigned + Math.round((pickupMinutes * 60_000) / timeScale),
    requested + MIN_CANCEL_WINDOW_MS
  );
  const dropoff = pickup + Math.round((tripMinutes * 60_000) / timeScale);
  const iso = (time: number) => new Date(time).toISOString();
  return {
    requestedAt: iso(requested),
    driverAssignedAt: iso(assigned),
    pickupAt: iso(pickup),
    dropoffAt: iso(dropoff),
  };
}

/** Upfront prices for every type; `available(type)` says whether a driver of it is free. */
export function rideQuotes(
  from: PlaceId,
  to: PlaceId,
  available: (type: RideType) => boolean
): { quotes: IRideQuote[]; distanceKm: number; tripMinutes: number } {
  const route = rideRoute(from, to);
  return {
    quotes: RIDE_TYPES.map((type) => {
      const free = available(type);
      return {
        type,
        label: RIDE_RATES[type].label,
        seats: RIDE_RATES[type].seats,
        fare: rideFare(type, route.distanceKm),
        pickupMinutes: free ? quotedPickupMinutes(from, type) : null,
        available: free,
      };
    }),
    distanceKm: route.distanceKm,
    tripMinutes: route.tripMinutes,
  };
}

/** Not cancelled and not yet at the destination. */
export function isActiveRide(
  ride: Pick<StoredRide, "cancelledAt" | "dropoffAt">,
  now: Date
): boolean {
  return (
    ride.cancelledAt === null && Date.parse(ride.dropoffAt) > now.getTime()
  );
}

/** Drivers of `type` that can take a booking: active, not frozen and not the rider. */
export function eligibleDrivers<T extends IDriver & { active: boolean }>(
  drivers: T[],
  {
    type,
    rider,
    frozen,
    busy,
  }: {
    type: RideType;
    rider?: string;
    frozen: (driver: T) => boolean;
    busy: (driver: T) => boolean;
  }
): T[] {
  return sortDrivers(
    drivers.filter(
      (driver) =>
        driver.rideType === type &&
        driver.active &&
        !(rider && same(driver.username, rider)) &&
        !frozen(driver) &&
        !busy(driver)
    )
  );
}

/** The price checked against what the rider saw; worded for rides. */
function fareChanged(expected: Cents, actual: Cents): PriceChangedError {
  const error = new PriceChangedError(expected, actual);
  error.message = "The fare changed. Check the new price and book again.";
  return error;
}

const toAuthor = ({ username, fullname, image }: IAuthor): IAuthor => ({
  username,
  fullname,
  image,
});

/**
 * A booking: the ride and its payment, a credit to the driver held until
 * pickup (so a cancellation before then can always be refunded). The
 * stores gather `activeRides` (exact under their rider lock) and the free
 * `candidates` (exact under the driver lock); this decides. Throws
 * InvalidStateError, LimitExceededError, PriceChangedError or
 * UnavailableError; the ledger then checks funds and freezes.
 */
export function planRide(
  input: NewRide,
  {
    now,
    timeScale,
    activeRides,
    candidates,
  }: {
    now: Date;
    timeScale: number;
    activeRides: number;
    candidates: IDriver[];
  }
): { ride: StoredRide; payment: PendingTransfer } {
  const route = rideRoute(input.from, input.to);
  if (activeRides >= LIMITS.ride.activePerRider) {
    throw new InvalidStateError(
      "You already have a ride in progress. Cancel it or wait until it ends."
    );
  }
  const fare = rideFare(input.type, route.distanceKm);
  if (fare > LIMITS.ride.maxFare) {
    throw new LimitExceededError("This trip is longer than rides allow");
  }
  if (fare !== input.expectedFare) throw fareChanged(input.expectedFare, fare);

  const driver = pickDriver(
    candidates.filter(
      (candidate) => !same(candidate.username, input.rider.username)
    ),
    input.operationId
  );
  if (!driver) {
    throw new UnavailableError(
      `No ${RIDE_RATES[input.type].label} drivers are free nearby. Try another ride type.`
    );
  }

  const id = input.operationId;
  const code = rideCode(id);
  const schedule = rideSchedule(now, {
    pickupMinutes: pickupMinutes(id),
    tripMinutes: route.tripMinutes,
    timeScale,
  });
  const ride: StoredRide = {
    id,
    code,
    rider: toAuthor(input.rider),
    driver: {
      ...toAuthor(driver),
      vehicle: { ...driver.vehicle },
      rideType: driver.rideType,
      seats: driver.seats,
    },
    from: route.from.id,
    to: route.to.id,
    type: input.type,
    fare,
    distanceKm: route.distanceKm,
    ...schedule,
    cancelledAt: null,
    paymentTransferId: `${id}-1`,
    refundTransferId: null,
    requestHash: input.fingerprint,
  };
  return {
    ride,
    payment: {
      id: ride.paymentTransferId,
      kind: "ride",
      from: toAuthor(input.rider),
      to: toAuthor(driver),
      amount: fare,
      note: null,
      context: { type: "ride", id, code },
      holdUntil: ride.pickupAt,
      reverses: null,
    },
  };
}

/** The refund of a cancelled ride: the held fare back to the rider, before pickup only. */
export function planRideRefund(ride: StoredRide, now: Date): PendingTransfer {
  if (Date.parse(ride.pickupAt) <= now.getTime()) {
    throw new InvalidStateError(
      "The driver has picked you up, so this ride can't be cancelled"
    );
  }
  return {
    id: `refund-${ride.paymentTransferId}`,
    kind: "ride_refund",
    from: toAuthor(ride.driver),
    to: toAuthor(ride.rider),
    amount: ride.fare,
    note: null,
    context: { type: "ride", id: ride.id, code: ride.code },
    holdUntil: null,
    reverses: ride.paymentTransferId,
  };
}

/** A cancellation's ledger fingerprint: cancelling is idempotent by state and takes no key. */
export const RIDE_CANCEL_FINGERPRINT = "rides.cancel";

/** "Ahmet" from "Ahmet Kaya": how ride copy names people ("Message Ahmet"). */
export const firstName = (fullname: string) =>
  fullname.trim().split(/\s+/)[0] ?? "";

function stageSpecs(ride: StoredRide): StageSpec<RideStatus>[] {
  return [
    { status: "finding", label: "Finding your driver", at: ride.requestedAt },
    {
      status: "arriving",
      label: `${firstName(ride.driver.fullname)} is on the way`,
      at: ride.driverAssignedAt,
    },
    { status: "on_trip", label: "Picked up", at: ride.pickupAt },
    {
      status: "completed",
      label: `Arrived at ${getPlace(ride.to).name}`,
      at: ride.dropoffAt,
    },
  ];
}

/** The API view of a stored ride at `now`. */
export function toRide(ride: StoredRide, now: Date): IRide {
  const { status, stages, next } = deriveStages(
    stageSpecs(ride),
    now,
    ride.cancelledAt
      ? { status: "cancelled", label: "Ride cancelled", at: ride.cancelledAt }
      : null
  );
  const progress: IRide["progress"] =
    status === "arriving"
      ? {
          leg: "pickup",
          fraction: legProgress(ride.driverAssignedAt, ride.pickupAt, now),
        }
      : status === "on_trip"
        ? {
            leg: "trip",
            fraction: legProgress(ride.pickupAt, ride.dropoffAt, now),
          }
        : { leg: null, fraction: status === "completed" ? 1 : 0 };

  return {
    id: ride.id,
    code: ride.code,
    rider: toAuthor(ride.rider),
    driver: {
      ...toAuthor(ride.driver),
      vehicle: { ...ride.driver.vehicle },
      rideType: ride.driver.rideType,
      seats: ride.driver.seats,
    },
    from: { ...getPlace(ride.from) },
    to: { ...getPlace(ride.to) },
    type: ride.type,
    fare: ride.fare,
    distanceKm: ride.distanceKm,
    requestedAt: ride.requestedAt,
    driverAssignedAt: ride.driverAssignedAt,
    pickupAt: ride.pickupAt,
    dropoffAt: ride.dropoffAt,
    cancelledAt: ride.cancelledAt,
    paymentTransferId: ride.paymentTransferId,
    refundTransferId: ride.refundTransferId,
    status,
    stages,
    eta:
      status === "finding" || status === "arriving"
        ? ride.pickupAt
        : status === "on_trip"
          ? ride.dropoffAt
          : null,
    nextChangeAt: next?.at ?? null,
    progress,
    canCancel: status === "finding" || status === "arriving",
  };
}

/**
 * The same ride derived at another moment, e.g. on the client's ticking
 * server clock between polls: the stored schedule is all the API sends, so
 * status, stages and the car's progress follow from it exactly as on the
 * server.
 */
export function rideAt(ride: IRide, now: Date): IRide {
  return toRide(
    {
      id: ride.id,
      code: ride.code,
      rider: ride.rider,
      driver: ride.driver,
      from: ride.from.id,
      to: ride.to.id,
      type: ride.type,
      fare: ride.fare,
      distanceKm: ride.distanceKm,
      requestedAt: ride.requestedAt,
      driverAssignedAt: ride.driverAssignedAt,
      pickupAt: ride.pickupAt,
      dropoffAt: ride.dropoffAt,
      cancelledAt: ride.cancelledAt,
      paymentTransferId: ride.paymentTransferId,
      refundTransferId: ride.refundTransferId,
      requestHash: null,
    },
    now
  );
}

/** The live activity line of a ride in progress ("Ahmet is on the way · arrives 14:29"). */
export function rideActivity(ride: IRide): ILiveActivity {
  const status =
    ride.status === "finding"
      ? "Finding your driver"
      : ride.status === "arriving"
        ? `${firstName(ride.driver.fullname)} is on the way`
        : `On the way to ${ride.to.name}`;
  return {
    kind: "ride",
    id: ride.id,
    title: `Ride to ${ride.to.name}`,
    status,
    eta: ride.eta,
    href: `/rides/${encodeURIComponent(ride.id)}`,
    nextChangeAt: ride.nextChangeAt,
  };
}

/** "Your ride to Atakule is complete", once the drop-off time has passed. */
export function rideNotification(
  ride: StoredRide,
  now: Date
): INotification | null {
  if (ride.cancelledAt !== null) return null;
  if (Date.parse(ride.dropoffAt) > now.getTime()) return null;
  return {
    id: `ride-completed-${ride.id}`,
    type: "ride",
    event: "completed",
    createdAt: ride.dropoffAt,
    actor: toAuthor(ride.driver),
    rideId: ride.id,
    destination: getPlace(ride.to).name,
  };
}

/**
 * A tip for the driver, sent through the wallet (kind "tip", the ride as
 * context). Only the rider may tip, and only once the ride is complete:
 * completion is final (a ride can't be cancelled after pickup), so this
 * read-check can't be overtaken by a later change.
 */
export function planRideTip(
  ride: IRide,
  from: IAuthor,
  amount: Cents,
  key: { operationId: string; fingerprint: string }
): SendInput {
  if (!canTipRide(from.username, ride)) {
    throw new ForbiddenError("Only the rider can tip the driver");
  }
  if (ride.status !== "completed") {
    throw new InvalidStateError(
      "You can tip your driver once the ride is complete"
    );
  }
  return {
    ...key,
    kind: "tip",
    from: toAuthor(from),
    to: toAuthor(ride.driver),
    amount,
    note: null,
    context: { type: "ride", id: ride.id, code: ride.code },
  };
}

/** The map's accessible name: "Map from Kızılay to Atakule, 5.1 km". */
export function rideMapLabel(
  from: IPlace,
  to: IPlace,
  distanceKm: number
): string {
  return `Map from ${from.name} to ${to.name}, ${distanceKm.toFixed(1)} km`;
}

/** The tip chips after a ride: 1, 2 and 5 credits. */
export const RIDE_TIP_PRESETS: readonly Cents[] = [100, 200, 500];

// Where the booking form starts: the city centre to Atakule, unless the
// link says otherwise ("Ride here" sends ?to=, "Book again" both).
const PICKUPS: PlaceId[] = ["kizilay", "tunali"];
const DESTINATIONS: PlaceId[] = ["atakule", "kizilay"];

const firstOther = (places: PlaceId[], avoid: PlaceId) =>
  places.find((place) => place !== avoid) as PlaceId;

/**
 * The booking form's pickup and destination from `?from=&to=` (unknown
 * places are ignored). They are always two different places: a requested
 * destination wins, and the pickup gives way.
 */
export function bookingRoute(query: { from?: unknown; to?: unknown }): {
  from: PlaceId;
  to: PlaceId;
} {
  const from = isPlaceId(query.from) ? query.from : null;
  const to = isPlaceId(query.to) ? query.to : null;
  if (!to && from) return { from, to: firstOther(DESTINATIONS, from) };
  const destination = to ?? DESTINATIONS[0];
  return {
    from:
      from && from !== destination ? from : firstOther(PICKUPS, destination),
    to: destination,
  };
}
