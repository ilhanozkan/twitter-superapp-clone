import { firstName, RIDE_RATES } from "../../lib/superapp/rides";
import { IRide } from "../../types/Ride";

/** Who is looking at a ride: the person riding, or the driver. */
export type RideRole = "rider" | "driver";

/** Whole minutes until `iso`, at least 1 while it is still ahead. */
export function minutesUntil(iso: string, now: Date): number {
  return Math.max(1, Math.ceil((Date.parse(iso) - now.getTime()) / 60_000));
}

/**
 * The ride page's headline at `now`. A countdown ("Ahmet is 3 min away")
 * changes every minute, so it is never what gets announced; see
 * `rideAnnouncement`. `arrivesAt` is shown after it as a local time.
 */
export function rideHeadline(
  ride: IRide,
  now: Date,
  role: RideRole
): { text: string; arrivesAt: string | null } {
  const driver = firstName(ride.driver.fullname);
  const rider = firstName(ride.rider.fullname);
  const plain = (text: string) => ({ text, arrivesAt: null });

  switch (ride.status) {
    case "finding":
      return plain(
        role === "rider" ? "Finding your driver…" : `New ride for ${rider}`
      );
    case "arriving": {
      const minutes = minutesUntil(ride.pickupAt, now);
      return plain(
        role === "rider"
          ? `${driver} is ${minutes} min away`
          : `Pick up ${rider} at ${ride.from.name} in ${minutes} min`
      );
    }
    case "on_trip":
      return {
        text:
          role === "rider"
            ? `On the way to ${ride.to.name}`
            : `Driving ${rider} to ${ride.to.name}`,
        arrivesAt: ride.dropoffAt,
      };
    case "completed":
      return plain(role === "rider" ? "You’ve arrived" : "Trip complete");
    case "cancelled":
      return plain(
        role === "rider" && ride.refundTransferId
          ? "Ride cancelled · refunded"
          : "Ride cancelled"
      );
  }
}

/** What a polite live region says when the ride reaches a new stage (never a countdown). */
export function rideAnnouncement(ride: IRide, role: RideRole): string {
  const driver = firstName(ride.driver.fullname);
  switch (ride.status) {
    case "finding":
      return role === "rider" ? "Finding your driver" : "New ride";
    case "arriving":
      return role === "rider"
        ? `${driver} is on the way to pick you up`
        : `Head to ${ride.from.name}`;
    case "on_trip":
      return `Picked up. On the way to ${ride.to.name}`;
    case "completed":
      return role === "rider"
        ? `You’ve arrived at ${ride.to.name}`
        : "Trip complete";
    case "cancelled":
      return role === "rider" && ride.refundTransferId
        ? "Ride cancelled. Your fare was refunded"
        : "Ride cancelled";
  }
}

/** "White Toyota Corolla" */
export const vehicleName = ({ vehicle }: IRide["driver"]) =>
  `${vehicle.color} ${vehicle.make} ${vehicle.model}`;

/** "Economy · 4 seats" */
export const rideTypeName = (ride: Pick<IRide, "type" | "driver">) =>
  `${RIDE_RATES[ride.type].label} · ${ride.driver.seats} seats`;

/** A list row's status: in progress, completed or cancelled. */
export function rideListStatus(ride: IRide): string {
  if (ride.status === "completed") return "Completed";
  if (ride.status === "cancelled") {
    return ride.refundTransferId ? "Cancelled · refunded" : "Cancelled";
  }
  return "In progress";
}
