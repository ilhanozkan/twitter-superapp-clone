import { IRide } from "../../../types/Ride";

// Who may see or act on a ride. Its rider and its driver can see it; the
// API answers 404 (not 403) to everyone else, so ids reveal nothing. Only
// the rider pays, so only the rider cancels (for a refund) or tips.

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

type Parties = Pick<IRide, "rider" | "driver">;

export function canViewRide(viewer: string, ride: Parties): boolean {
  return (
    same(viewer, ride.rider.username) || same(viewer, ride.driver.username)
  );
}

export function canCancelRide(viewer: string, ride: Parties): boolean {
  return same(viewer, ride.rider.username);
}

export function canTipRide(viewer: string, ride: Parties): boolean {
  return same(viewer, ride.rider.username);
}
