import { PUBLISHED } from "./groq";

// GROQ for rides. Driver profiles are public documents joined with their
// user record (name, avatar) and wallet freeze; rides and driver locks are
// private. Every query follows the SuperApp rules in ./groq: typed,
// PUBLISHED, `$now` from the app clock, only validated integers interpolated.

const VEHICLE = `"vehicle": vehicle{ make, model, color, plate }`;

const party = (field: string) =>
  `${field}{ "username": username, "fullname": coalesce(fullname, username), "image": image }`;

/** A ride document as `rideFromRow` reads it; `id` is the private id. */
export const RIDE_FIELDS = `"id": _id, code, "rider": ${party(
  "rider"
)}, "driver": driver{ "username": username, "fullname": coalesce(fullname, username), "image": image, ${VEHICLE}, rideType, seats }, "from": fromPlaceId, "to": toPlaceId, "type": rideType, fare, distanceKm, requestedAt, driverAssignedAt, pickupAt, dropoffAt, cancelledAt, paymentTransferId, refundTransferId`;

const DRIVER_FIELDS = `
  username,
  ${VEHICLE},
  rideType,
  "seats": coalesce(seats, 4),
  "active": active != false,
  "user": *[_type == "user" && lower(username) == lower(^.username) && ${PUBLISHED}][0]{
    username, "fullname": coalesce(fullname, username), "image": image
  },
  "frozen": count(*[_type == "walletFreeze" && lower(username) == lower(^.username) && ${PUBLISHED}]) > 0
`;

export const DRIVER_QUERY = `*[_type == "driverProfile" && lower(username) == $username && ${PUBLISHED}][0]{${DRIVER_FIELDS}}`;

export const DRIVERS_QUERY = `*[_type == "driverProfile" && ${PUBLISHED}]{${DRIVER_FIELDS}}`;

/** Locks still held at `$now`: their drivers are on a trip. */
const BUSY_DRIVERS = `*[_type == "driverLock" && dateTime(until) > dateTime($now) && ${PUBLISHED}].driverKey`;

/** Everything a quote needs: every driver, and who is busy. */
export const QUOTE_QUERY = `{
  "drivers": ${DRIVERS_QUERY},
  "busy": ${BUSY_DRIVERS}
}`;

/** The locks of the candidate drivers, with the revision a booking guards. */
export const LOCKS_QUERY = `*[_type == "driverLock" && _id in $ids && ${PUBLISHED}]{ "id": _id, driverKey, rideId, until, _rev }`;

export const RIDE_QUERY = `*[_type == "ride" && _id == $id && ${PUBLISHED}][0]{ ${RIDE_FIELDS}, _rev }`;

const ACTIVE = `!defined(cancelledAt) && dateTime(dropoffAt) > dateTime($now)`;

/** The rider's rides in progress at `$now`; exact under the rider's wallet lock. */
export const ACTIVE_RIDES_COUNT = `count(*[_type == "ride" && riderKey == $key && ${ACTIVE} && ${PUBLISHED}])`;

export const ACTIVE_RIDES_QUERY = `*[_type == "ride" && riderKey == $key && ${ACTIVE} && ${PUBLISHED}] | order(requestedAt desc, _id desc) { ${RIDE_FIELDS} }`;

/** The rider's completed rides, newest drop-off first; `limit` is a validated integer. */
export const completedRidesQuery = (limit: number) =>
  `*[_type == "ride" && riderKey == $key && !defined(cancelledAt) && dateTime(dropoffAt) <= dateTime($now) && ${PUBLISHED}] | order(dropoffAt desc, _id desc) [0...${limit}] { ${RIDE_FIELDS} }`;

const RIDES_CURSOR =
  "(dateTime(requestedAt) < dateTime($cursorRequestedAt) || " +
  "(dateTime(requestedAt) == dateTime($cursorRequestedAt) && _id < $cursorId))";

/** Newest first by (requestedAt, id), like the memory store; `fetchCount` is a validated integer. */
export const ridesQuery = (
  filters: { rider: boolean; driver: boolean; cursor: boolean },
  fetchCount: number
) =>
  `*[_type == "ride"${filters.rider ? " && riderKey == $rider" : ""}${
    filters.driver ? " && driverKey == $driver" : ""
  }${filters.cursor ? ` && ${RIDES_CURSOR}` : ""} && ${PUBLISHED}] | order(requestedAt desc, _id desc) [0...${fetchCount}] { ${RIDE_FIELDS} }`;
