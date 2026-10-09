import { SeedData } from "../../seed";
import {
  driverLockDocument,
  driverProfileDocument,
  rideDocument,
} from "../rides";
import { SanitySeedDocument } from "./documents";

/**
 * Driver profiles are public and live-edited; rides and driver locks are
 * private. Each driver with a seeded ride gets the lock the app would have
 * left: held by their latest ride until it ended.
 */
export function ridesSanityDocuments(seed: SeedData): SanitySeedDocument[] {
  const rides = seed.superapp?.rides;
  if (!rides) return [];

  const joinedAt = new Map(
    seed.users.map((user) => [user.username.toLowerCase(), user.joinedAt])
  );
  const profiles = rides.drivers.map((profile) => {
    const createdAt = joinedAt.get(profile.username.toLowerCase());
    if (!createdAt) {
      throw new Error(`Driver profile for unknown user "${profile.username}"`);
    }
    return { ...driverProfileDocument(profile), _createdAt: createdAt };
  });

  const latest = new Map<string, (typeof rides.rides)[number]>();
  for (const ride of rides.rides) {
    const key = ride.driver.username.toLowerCase();
    const seen = latest.get(key);
    if (!seen || seen.requestedAt < ride.requestedAt) latest.set(key, ride);
  }
  const locks = [...latest.values()].map((ride) => ({
    ...driverLockDocument({
      driver: ride.driver.username,
      rideId: ride.id,
      until: ride.cancelledAt ?? ride.dropoffAt,
      at: ride.requestedAt,
    }),
    _createdAt: ride.requestedAt,
  }));

  return [
    ...profiles,
    ...rides.rides.map((ride) => ({
      ...rideDocument(ride),
      _createdAt: ride.requestedAt,
    })),
    ...locks,
  ];
}
