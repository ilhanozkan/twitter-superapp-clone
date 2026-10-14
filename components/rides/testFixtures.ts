import type { StoredRide } from "../../lib/db/rides/types";
import { toRide } from "../../lib/superapp/rides";
import { testViewer } from "../../test/render";
import { IDriver, IRide } from "../../types/Ride";

// Rides for component tests: the demo viewer rides Kızılay → Atakule with
// Ahmet. The schedule is fixed; `rideAfter(seconds)` derives the ride that
// many seconds after it was requested, as the API would send it.

export const REQUESTED_AT = "2026-10-09T14:00:00.000Z";

export const ahmet: IDriver = {
  username: "ahmet_drives",
  fullname: "Ahmet Kaya",
  image: null,
  vehicle: {
    make: "Toyota",
    model: "Corolla",
    color: "White",
    plate: "06 AK 1234",
  },
  rideType: "economy",
  seats: 4,
};

const at = (seconds: number) =>
  new Date(Date.parse(REQUESTED_AT) + seconds * 1000);

/** Assigned at 10 s, pickup at 3 min, drop-off at 11 min. */
export function storedRide(fields: Partial<StoredRide> = {}): StoredRide {
  return {
    id: "ride-test1",
    code: "R7K2",
    rider: testViewer,
    driver: ahmet,
    from: "kizilay",
    to: "atakule",
    type: "economy",
    fare: 630,
    distanceKm: 5.1,
    requestedAt: REQUESTED_AT,
    driverAssignedAt: at(10).toISOString(),
    pickupAt: at(180).toISOString(),
    dropoffAt: at(660).toISOString(),
    cancelledAt: null,
    paymentTransferId: "ride-test1-1",
    refundTransferId: null,
    requestHash: null,
    ...fields,
  };
}

/** The ride `seconds` after it was requested, and the server's clock then. */
export function rideAfter(
  seconds: number,
  fields: Partial<StoredRide> = {}
): { ride: IRide; serverNow: string; now: Date } {
  const now = at(seconds);
  return {
    ride: toRide(storedRide(fields), now),
    serverNow: now.toISOString(),
    now,
  };
}

/** A ride cancelled (and refunded) `seconds` after it was requested. */
export const cancelledFields = (seconds: number): Partial<StoredRide> => ({
  cancelledAt: at(seconds).toISOString(),
  refundTransferId: "refund-ride-test1-1",
});
