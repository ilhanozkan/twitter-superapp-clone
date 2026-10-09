import {
  eligibleDrivers,
  planRide,
  planRideRefund,
  RIDE_CANCEL_FINGERPRINT,
  rideActivity,
  rideNotification,
  rideQuotes,
  toRide,
} from "../../superapp/rides";
import { INotification } from "../../../types/Notification";
import { IDriver, IVehicle, RideType } from "../../../types/Ride";
import { PlaceId } from "../../../types/Superapp";
import { IAuthor } from "../../../types/User";
import {
  clampLimit,
  compareNewestFirst,
  decodeCursor,
  encodeCursor,
} from "../cursor";
import { NotFoundError } from "../errors";
import { DriverProfile, RidesRepository, StoredRide } from "../rides/types";
import { SanityDeps } from "./deps";
import { KEY_PATTERN, keyOf, privateId } from "./ids";
import { SanityMutation } from "./ledger";
import {
  ACTIVE_RIDES_COUNT,
  ACTIVE_RIDES_QUERY,
  completedRidesQuery,
  DRIVER_QUERY,
  DRIVERS_QUERY,
  LOCKS_QUERY,
  QUOTE_QUERY,
  RIDE_QUERY,
  ridesQuery,
} from "./ridesQueries";
import { compact } from "./seeds/documents";

// Rides as Sanity documents and back. Driver profiles are public and
// live-edited in Studio; rides and driver locks are private ("private."
// ids). The app and the seed export share these converters.

const lower = (username: string) => username.toLowerCase();

const party = (author: IAuthor) =>
  compact({
    username: author.username,
    fullname: author.fullname,
    image: author.image,
  });

/** Driver profiles have deterministic ids, one per account. */
export function driverProfileId(username: string): string {
  return `driverProfile-${lower(username)}`;
}

export function driverProfileDocument(profile: DriverProfile) {
  return {
    _id: driverProfileId(profile.username),
    _type: "driverProfile",
    username: profile.username,
    vehicle: { ...profile.vehicle },
    rideType: profile.rideType,
    seats: profile.seats,
    active: profile.active,
  };
}

/** The key of a driver's lock: one per driver, so two bookings contend on it. */
export function driverLockKey(username: string): string {
  return `driverlock-${lower(username)}`;
}

/** A driver is busy until `until`: the booked ride's drop-off, or its cancellation. */
export function driverLockDocument({
  driver,
  rideId,
  until,
  at,
}: {
  driver: string;
  rideId: string;
  until: string;
  at: string;
}) {
  return {
    _id: privateId(driverLockKey(driver)),
    _type: "driverLock",
    driverKey: lower(driver),
    rideId,
    until,
    createdAt: at,
    updatedAt: at,
  };
}

/** A ride as written. Only an app booking carries `requestHash`. */
export function rideDocument(ride: StoredRide) {
  return compact({
    _id: privateId(ride.id),
    _type: "ride",
    code: ride.code,
    rider: party(ride.rider),
    riderKey: lower(ride.rider.username),
    driver: compact({
      ...party(ride.driver),
      vehicle: { ...ride.driver.vehicle },
      rideType: ride.driver.rideType,
      seats: ride.driver.seats,
    }),
    driverKey: lower(ride.driver.username),
    fromPlaceId: ride.from,
    toPlaceId: ride.to,
    rideType: ride.type,
    fare: ride.fare,
    distanceKm: ride.distanceKm,
    requestedAt: ride.requestedAt,
    driverAssignedAt: ride.driverAssignedAt,
    pickupAt: ride.pickupAt,
    dropoffAt: ride.dropoffAt,
    cancelledAt: ride.cancelledAt,
    paymentTransferId: ride.paymentTransferId,
    refundTransferId: ride.refundTransferId,
    createdAt: ride.requestedAt,
    requestHash: ride.requestHash,
  });
}

/** A ride as RIDE_FIELDS reads it. */
export interface RideRow {
  id: string;
  code: string;
  rider: { username: string; fullname: string; image?: string | null };
  driver: {
    username: string;
    fullname: string;
    image?: string | null;
    vehicle: IVehicle;
    rideType: RideType;
    seats: number;
  };
  from: PlaceId;
  to: PlaceId;
  type: RideType;
  fare: number;
  distanceKm: number;
  requestedAt: string;
  driverAssignedAt: string;
  pickupAt: string;
  dropoffAt: string;
  cancelledAt?: string | null;
  paymentTransferId: string;
  refundTransferId?: string | null;
}

export function rideFromRow(row: RideRow): StoredRide {
  return {
    id: keyOf(row.id),
    code: row.code,
    rider: { ...row.rider, image: row.rider.image ?? null },
    driver: {
      username: row.driver.username,
      fullname: row.driver.fullname,
      image: row.driver.image ?? null,
      vehicle: { ...row.driver.vehicle },
      rideType: row.driver.rideType,
      seats: row.driver.seats,
    },
    from: row.from,
    to: row.to,
    type: row.type,
    fare: row.fare,
    distanceKm: row.distanceKm,
    requestedAt: row.requestedAt,
    driverAssignedAt: row.driverAssignedAt,
    pickupAt: row.pickupAt,
    dropoffAt: row.dropoffAt,
    cancelledAt: row.cancelledAt ?? null,
    paymentTransferId: row.paymentTransferId,
    refundTransferId: row.refundTransferId ?? null,
    requestHash: null,
  };
}

interface DriverRow {
  username: string;
  vehicle: IVehicle;
  rideType: RideType;
  seats: number;
  active: boolean;
  user: { username: string; fullname: string; image?: string | null } | null;
  frozen: boolean;
}

type PooledDriver = IDriver & { active: boolean; frozen: boolean };

/** A profile whose user record exists, named and pictured from it. */
function toDriver(row: DriverRow | null): PooledDriver | null {
  if (!row?.user) return null;
  return {
    username: row.user.username,
    fullname: row.user.fullname,
    image: row.user.image ?? null,
    vehicle: { ...row.vehicle },
    rideType: row.rideType,
    seats: row.seats,
    active: row.active,
    frozen: row.frozen,
  };
}

interface LockRow {
  id: string;
  driverKey: string;
  rideId: string;
  until: string;
  _rev: string;
}

/**
 * Rides on Sanity. A booking is one ledger transaction: the rider's wallet
 * is revision-locked with their active-ride count read in the same
 * snapshot (one active ride, exactly), and the chosen driver's
 * `driverlock-<username>` is created or patched under its revision, so a
 * concurrent booking of the same driver conflicts, retries and finds them
 * busy. Rides are private, so the feature needs a token.
 */
export function createSanityRides(deps: SanityDeps): RidesRepository {
  const { read, ledger, now, timeScale } = deps;

  const getWallet = (username: string) =>
    deps.self().wallet.getWallet(username);

  const readRide = async (id: string) => {
    if (!KEY_PATTERN.test(id)) return null;
    return read<(RideRow & { _rev: string }) | null>(RIDE_QUERY, {
      id: privateId(id),
    });
  };

  const getRide = async (id: string) => {
    const row = await readRide(id);
    return row ? toRide(rideFromRow(row), now()) : null;
  };

  const toDrivers = (rows: DriverRow[] | null) =>
    (rows ?? []).flatMap((row) => {
      const driver = toDriver(row);
      return driver ? [driver] : [];
    });

  /** Locks by lower-case driver username, with their revisions. */
  const readLocks = async (usernames: string[]) => {
    const rows =
      (await read<LockRow[]>(LOCKS_QUERY, {
        ids: usernames.map((username) => privateId(driverLockKey(username))),
      })) ?? [];
    return new Map(rows.map((lock) => [lock.driverKey, lock]));
  };

  /** Takes a driver until `until`: guarded by the lock's revision, or a create that conflicts. */
  const takeLock = (
    lock: LockRow | undefined,
    driver: string,
    { rideId, until, at }: { rideId: string; until: string; at: string }
  ): SanityMutation =>
    lock
      ? {
          patch: {
            id: lock.id,
            ifRevisionID: lock._rev,
            set: { rideId, until, updatedAt: at },
          },
        }
      : { create: driverLockDocument({ driver, rideId, until, at }) };

  return {
    implemented: true,
    configured: deps.canReadPrivate,

    async notifications(username, limit) {
      const safeLimit = Math.max(0, Math.floor(limit));
      if (safeLimit === 0) return [];
      const at = now();
      const rides = (
        (await read<RideRow[]>(completedRidesQuery(safeLimit), {
          key: lower(username),
          now: at.toISOString(),
        })) ?? []
      ).map(rideFromRow);
      return rides
        .map((ride) => rideNotification(ride, at))
        .filter((item): item is INotification => item !== null)
        .sort(compareNewestFirst)
        .slice(0, safeLimit);
    },

    async liveActivity(username) {
      const at = now();
      const rows =
        (await read<RideRow[]>(ACTIVE_RIDES_QUERY, {
          key: lower(username),
          now: at.toISOString(),
        })) ?? [];
      return rows.map((row) => rideActivity(toRide(rideFromRow(row), at)));
    },

    async quote(from, to) {
      const row = await read<{ drivers: DriverRow[]; busy: string[] }>(
        QUOTE_QUERY,
        { now: now().toISOString() }
      );
      const drivers = toDrivers(row?.drivers ?? null);
      const busy = new Set(row?.busy ?? []);
      return rideQuotes(
        from,
        to,
        (type) =>
          eligibleDrivers(drivers, {
            type,
            frozen: (driver) => driver.frozen,
            busy: (driver) => busy.has(lower(driver.username)),
          }).length > 0
      );
    },

    async bookRide(input) {
      deps.assertWritable();
      const rider = input.rider.username;
      // Profiles only change in Studio; whether each driver is free and
      // unfrozen is read again on every attempt.
      const pool = toDrivers(await read<DriverRow[]>(DRIVERS_QUERY)).filter(
        (driver) => driver.rideType === input.type
      );

      const { result, replayed } = await ledger.commit({
        operationId: input.operationId,
        fingerprint: input.fingerprint,
        primaryType: "ride",
        // Every candidate, so their freezes are in the snapshot.
        parties: [rider, ...pool.map((driver) => driver.username)],
        locks: [rider],
        counts: {
          activeRides: {
            query: ACTIVE_RIDES_COUNT,
            params: { key: lower(rider) },
          },
        },
        replay: async () => ({ ride: (await getRide(input.operationId))! }),
        prepare: async (snapshot) => {
          const locks = await readLocks(pool.map((driver) => driver.username));
          const time = snapshot.now.getTime();
          const { ride, payment } = planRide(input, {
            now: snapshot.now,
            timeScale,
            activeRides: snapshot.counts.activeRides,
            candidates: eligibleDrivers(pool, {
              type: input.type,
              rider,
              frozen: (driver) => snapshot.wallet(driver.username).frozen,
              busy: (driver) => {
                const lock = locks.get(lower(driver.username));
                return !!lock && Date.parse(lock.until) > time;
              },
            }),
          });
          return {
            transfers: [payment],
            mutations: () => [
              { create: rideDocument(ride) },
              takeLock(
                locks.get(lower(ride.driver.username)),
                ride.driver.username,
                {
                  rideId: ride.id,
                  until: ride.dropoffAt,
                  at: snapshot.now.toISOString(),
                }
              ),
            ],
            result: () => ({ ride: toRide(ride, snapshot.now) }),
          };
        },
      });
      return { ...result, wallet: await getWallet(rider), replayed };
    },

    getRide,

    async listRides(query) {
      const limit = clampLimit(query.limit);
      const cursor = decodeCursor(query.cursor);
      const params: Record<string, unknown> = {};
      if (query.rider) params.rider = lower(query.rider);
      if (query.driver) params.driver = lower(query.driver);
      if (cursor) {
        params.cursorRequestedAt = cursor.createdAt;
        params.cursorId = KEY_PATTERN.test(cursor.id)
          ? privateId(cursor.id)
          : cursor.id;
      }
      const rows =
        (await read<RideRow[]>(
          ridesQuery(
            {
              rider: !!query.rider,
              driver: !!query.driver,
              cursor: !!cursor,
            },
            limit + 1
          ),
          params
        )) ?? [];
      const at = now();
      const page = rows.slice(0, limit).map(rideFromRow);
      const last = page[page.length - 1];
      return {
        items: page.map((ride) => toRide(ride, at)),
        nextCursor:
          rows.length > limit && last
            ? encodeCursor({ createdAt: last.requestedAt, id: last.id })
            : null,
      };
    },

    async cancelRide({ id }) {
      deps.assertWritable();
      const found = await readRide(id);
      if (!found) throw new NotFoundError("Ride not found");
      const stored = rideFromRow(found);
      if (stored.cancelledAt !== null) {
        return { ride: toRide(stored, now()), changed: false };
      }

      const { result, replayed } = await ledger.commit({
        operationId: `refund-${stored.paymentTransferId}`,
        fingerprint: RIDE_CANCEL_FINGERPRINT,
        primaryType: "transfer",
        parties: [stored.driver.username, stored.rider.username],
        reverses: [stored.paymentTransferId],
        // Another cancel won: answer with the ride as it is now.
        replay: async () => (await getRide(id))!,
        prepare: async (snapshot) => {
          // Re-read on every attempt: the ride patch is guarded by this _rev.
          const row = await readRide(id);
          if (!row) throw new NotFoundError("Ride not found");
          const ride = rideFromRow(row);
          const lock = (await readLocks([ride.driver.username])).get(
            lower(ride.driver.username)
          );
          return {
            transfers: [planRideRefund(ride, snapshot.now)],
            mutations: ([refund]) => [
              {
                patch: {
                  id: privateId(id),
                  ifRevisionID: row._rev,
                  set: {
                    cancelledAt: refund.createdAt,
                    refundTransferId: refund.id,
                  },
                },
              },
              // Frees the driver, unless the lock already moved on.
              ...(lock?.rideId === id
                ? [
                    {
                      patch: {
                        id: lock.id,
                        ifRevisionID: lock._rev,
                        set: {
                          until: refund.createdAt,
                          updatedAt: refund.createdAt,
                        },
                      },
                    },
                  ]
                : []),
            ],
            result: ([refund]) =>
              toRide(
                {
                  ...ride,
                  cancelledAt: refund.createdAt,
                  refundTransferId: refund.id,
                },
                snapshot.now
              ),
          };
        },
      });
      return { ride: result, changed: !replayed };
    },

    async getDriver(username) {
      const driver = toDriver(
        await read<DriverRow | null>(DRIVER_QUERY, {
          username: lower(username),
        })
      );
      if (!driver) return null;
      const { active, frozen, ...rest } = driver;
      void active;
      void frozen;
      return rest;
    },
  };
}
