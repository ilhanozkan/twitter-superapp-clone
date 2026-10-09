import {
  eligibleDrivers,
  isActiveRide,
  planRide,
  planRideRefund,
  RIDE_CANCEL_FINGERPRINT,
  rideActivity,
  rideNotification,
  rideQuotes,
  toRide,
} from "../../superapp/rides";
import { toWallet } from "../../superapp/wallet";
import { INotification } from "../../../types/Notification";
import { IDriver } from "../../../types/Ride";
import {
  clampLimit,
  compareNewestFirst,
  decodeCursor,
  encodeCursor,
  isAfterCursor,
} from "../cursor";
import { LimitExceededError, NotFoundError } from "../errors";
import { DriverProfile, RidesRepository, StoredRide } from "../rides/types";
import { RidesSeed } from "../seeds/rides";
import { MemoryDeps } from "./deps";

export interface RidesMemoryState {
  /** Keyed by lower-cased username. */
  drivers: Map<string, DriverProfile>;
  /** Never evicted: past `limits.rides`, new bookings are refused. */
  rides: Map<string, StoredRide>;
}

export function createRidesMemoryState(
  seed: RidesSeed | null
): RidesMemoryState {
  return {
    drivers: new Map(
      (seed?.drivers ?? []).map((driver) => [
        driver.username.toLowerCase(),
        structuredClone(driver),
      ])
    ),
    rides: new Map(
      (seed?.rides ?? []).map((ride) => [ride.id, structuredClone(ride)])
    ),
  };
}

const lower = (username: string) => username.toLowerCase();
const same = (a: string, b: string) => lower(a) === lower(b);

/** Rides by (requestedAt, id), the order every list uses. */
const position = (ride: StoredRide) => ({
  createdAt: ride.requestedAt,
  id: ride.id,
});

/**
 * Rides in memory. A driver is busy while one of their rides is active, so
 * the rides themselves are the driver locks; booking and cancelling each
 * run in one synchronous ledger commit, so two bookings can never take the
 * same driver and a rider never gets two active rides.
 */
export function createMemoryRides(deps: MemoryDeps): RidesRepository {
  const { state, now, ledger, timeScale, limits } = deps;
  const store = state.rides;

  const readWallet = (username: string) =>
    toWallet(username, ledger.view().wallet(username));

  /** Drivers whose user record exists, with their name and avatar from it. */
  const drivers = (): (IDriver & { active: boolean })[] =>
    [...store.drivers.values()].flatMap((profile) => {
      const user = state.users.get(lower(profile.username));
      if (!user) return [];
      return [
        {
          username: user.username,
          fullname: user.fullname,
          image: user.image,
          vehicle: { ...profile.vehicle },
          rideType: profile.rideType,
          seats: profile.seats,
          active: profile.active,
        },
      ];
    });

  const busy = (at: Date) => {
    const keys = new Set<string>();
    store.rides.forEach((ride) => {
      if (isActiveRide(ride, at)) keys.add(lower(ride.driver.username));
    });
    return (username: string) => keys.has(lower(username));
  };

  const activeRidesOf = (username: string, at: Date) =>
    [...store.rides.values()].filter(
      (ride) => same(ride.rider.username, username) && isActiveRide(ride, at)
    );

  return {
    implemented: true,
    configured: true,

    async notifications(username, limit) {
      const at = now();
      const safeLimit = Math.max(0, Math.floor(limit));
      return [...store.rides.values()]
        .filter((ride) => same(ride.rider.username, username))
        .map((ride) => rideNotification(ride, at))
        .filter((item): item is INotification => item !== null)
        .sort(compareNewestFirst)
        .slice(0, safeLimit);
    },

    async liveActivity(username) {
      const at = now();
      return activeRidesOf(username, at)
        .sort((a, b) => compareNewestFirst(position(a), position(b)))
        .map((ride) => rideActivity(toRide(ride, at)));
    },

    async quote(from, to) {
      const at = now();
      const isBusy = busy(at);
      const all = drivers();
      return rideQuotes(
        from,
        to,
        (type) =>
          eligibleDrivers(all, {
            type,
            frozen: (driver) => state.wallet.frozen.has(lower(driver.username)),
            busy: (driver) => isBusy(driver.username),
          }).length > 0
      );
    },

    async bookRide(input) {
      const rider = input.rider.username;
      const { result, replayed } = ledger.commit({
        operationId: input.operationId,
        fingerprint: input.fingerprint,
        storedFingerprint: () => {
          const stored = store.rides.get(input.operationId);
          return stored ? (stored.requestHash ?? "") : undefined;
        },
        replay: () => ({
          ride: toRide(store.rides.get(input.operationId)!, now()),
        }),
        prepare: (view) => {
          const isBusy = busy(view.now);
          if (store.rides.size >= limits.rides) {
            throw new LimitExceededError(
              "The demo store is full; restart the server"
            );
          }
          const { ride, payment } = planRide(input, {
            now: view.now,
            timeScale,
            activeRides: activeRidesOf(rider, view.now).length,
            candidates: eligibleDrivers(drivers(), {
              type: input.type,
              rider,
              frozen: (driver) => view.wallet(driver.username).frozen,
              busy: (driver) => isBusy(driver.username),
            }),
          });
          return {
            transfers: [payment],
            apply: () => {
              store.rides.set(ride.id, structuredClone(ride));
              return { ride: toRide(ride, view.now) };
            },
          };
        },
      });
      return { ...result, wallet: readWallet(rider), replayed };
    },

    async getRide(id) {
      const ride = store.rides.get(id);
      return ride ? toRide(ride, now()) : null;
    },

    async listRides(query) {
      const at = now();
      const limit = clampLimit(query.limit);
      const cursor = decodeCursor(query.cursor);
      const matches = [...store.rides.values()]
        .filter(
          (ride) =>
            (!query.rider || same(ride.rider.username, query.rider)) &&
            (!query.driver || same(ride.driver.username, query.driver)) &&
            (!cursor || isAfterCursor(position(ride), cursor))
        )
        .sort((a, b) => compareNewestFirst(position(a), position(b)));

      const page = matches.slice(0, limit);
      const last = page[page.length - 1];
      return {
        items: page.map((ride) => toRide(ride, at)),
        nextCursor:
          matches.length > limit && last ? encodeCursor(position(last)) : null,
      };
    },

    async cancelRide({ id }) {
      const ride = store.rides.get(id);
      if (!ride) throw new NotFoundError("Ride not found");
      if (ride.cancelledAt !== null) {
        return { ride: toRide(ride, now()), changed: false };
      }

      const refundId = `refund-${ride.paymentTransferId}`;
      const { result, replayed } = ledger.commit({
        operationId: refundId,
        fingerprint: RIDE_CANCEL_FINGERPRINT,
        storedFingerprint: () => {
          const stored = state.wallet.transfers.get(refundId);
          return stored ? (stored.requestHash ?? "") : undefined;
        },
        replay: () => toRide(ride, now()),
        prepare: (view) => ({
          transfers: [planRideRefund(ride, view.now)],
          // Ending the ride frees the driver: the ride was their lock.
          apply: ([refund]) => {
            ride.cancelledAt = refund.createdAt;
            ride.refundTransferId = refund.id;
            return toRide(ride, view.now);
          },
        }),
      });
      return { ride: result, changed: !replayed };
    },

    async getDriver(username) {
      const driver = drivers().find((candidate) =>
        same(candidate.username, username)
      );
      if (!driver) return null;
      const { active, ...rest } = driver;
      void active;
      return rest;
    },
  };
}
