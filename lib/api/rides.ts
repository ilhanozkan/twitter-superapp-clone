import { z } from "zod";

import { getRepository } from "../db";
import { LIMITS } from "../superapp/limits";
import { canViewRide } from "../superapp/policy/rides";
import { RIDE_TYPES } from "../superapp/rides";
import { IRide, RideType } from "../../types/Ride";
import { notFound } from "./errors";
import { cents, pageQuery, placeId } from "./validation";

// Request schemas and shared steps of the rides routes. The rider is always
// the current user (lib/auth.ts); bodies name places, a ride type and the
// fare the rider saw, and unknown fields (rider, driver...) are dropped.

const DIFFERENT_PLACES = "Choose a destination other than the pickup";

/** Pickup and destination: two different places of the catalog. */
const route = z
  .object({ from: placeId, to: placeId })
  .refine(({ from, to }) => from !== to, {
    path: ["to"],
    message: DIFFERENT_PLACES,
  });

export const quoteQuery = route;

export const rideType = z.enum(RIDE_TYPES as [RideType, ...RideType[]], {
  error: "Choose economy, comfort or xl",
});

export const bookBody = z
  .object({
    from: placeId,
    to: placeId,
    type: rideType,
    /** The fare the rider was quoted, in cents; a stale one is refused (409 price_changed). */
    expectedFare: z
      .number({ error: "expectedFare must be the quoted fare in cents" })
      .int("expectedFare must be a whole number of cents")
      .positive("expectedFare must be the quoted fare in cents")
      .max(LIMITS.ride.maxFare, "expectedFare is more than any ride costs"),
  })
  .refine(({ from, to }) => from !== to, {
    path: ["to"],
    message: DIFFERENT_PLACES,
  });

export const ridesQuery = pageQuery.extend({
  /** rider (default): the user's trips; driver: the trips they drove. */
  as: z
    .enum(["rider", "driver"], { error: "as must be rider or driver" })
    .default("rider"),
});

export const rideTipBody = z.object({
  amount: cents(LIMITS.tip.min, LIMITS.tip.max),
});

/** A ride the viewer rode or drove; 404 for everyone else, so ids reveal nothing. */
export async function visibleRide(id: string, viewer: string): Promise<IRide> {
  const ride = await getRepository().rides.getRide(id);
  if (!ride || !canViewRide(viewer, ride)) throw notFound("Ride not found");
  return ride;
}

export const rideLocation = (ride: IRide) =>
  `/api/rides/${encodeURIComponent(ride.id)}`;
