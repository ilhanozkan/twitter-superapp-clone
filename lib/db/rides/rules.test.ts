import { describe, expect, it } from "vitest";

import { IDriver } from "../../../types/Ride";
import { IAuthor } from "../../../types/User";
import {
  ForbiddenError,
  InvalidStateError,
  PriceChangedError,
  UnavailableError,
} from "../errors";
import { getPlace } from "../../superapp/places";
import {
  canCancelRide,
  canTipRide,
  canViewRide,
} from "../../superapp/policy/rides";
import {
  bookingRoute,
  eligibleDrivers,
  isActiveRide,
  MIN_CANCEL_WINDOW_MS,
  pickDriver,
  pickupMinutes,
  planRide,
  planRideRefund,
  planRideTip,
  quotedPickupMinutes,
  RIDE_RATES,
  RIDE_TYPES,
  rideActivity,
  rideAt,
  rideCode,
  rideFare,
  rideMapLabel,
  rideNotification,
  rideQuotes,
  rideRoute,
  rideSchedule,
  roundToTen,
  stableHash,
  toRide,
  tripMinutes,
} from "../../superapp/rides";
import { NewRide, StoredRide } from "./types";

// The pure ride rules (lib/superapp/rides.ts) and policy
// (lib/superapp/policy/rides.ts) both stores and the UI share: the pinned
// fare tables, the schedule and its real-time floors, matching, stages and
// what a ride tells its rider. They live with the rides lane's other tests.

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const T0 = new Date("2026-10-08T12:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

const author = (username: string, fullname = username): IAuthor => ({
  username,
  fullname,
  image: null,
});
const rider = author("illlhanozkan", "Ilhan Ozkan");

const driver = (
  username: string,
  fullname: string,
  rideType: IDriver["rideType"] = "economy"
): IDriver & { active: boolean } => ({
  ...author(username, fullname),
  vehicle: {
    make: "Toyota",
    model: "Corolla",
    color: "White",
    plate: "06 AK 1234",
  },
  rideType,
  seats: rideType === "xl" ? 6 : 4,
  active: true,
});
const ahmet = driver("ahmet_drives", "Ahmet Kaya");
const elif = driver("elif_rides", "Elif Şahin");

const newRide = (fields: Partial<NewRide> = {}): NewRide => ({
  operationId: "ride-0123456789abcdef0123456789abcdef",
  fingerprint: "hash",
  rider,
  from: "kizilay",
  to: "atakule",
  type: "economy",
  expectedFare: 630,
  ...fields,
});

const book = (
  fields: Partial<NewRide> = {},
  ctx: Partial<Parameters<typeof planRide>[1]> = {}
) =>
  planRide(newRide(fields), {
    now: T0,
    timeScale: 1,
    activeRides: 0,
    candidates: [ahmet, elif],
    ...ctx,
  });

describe("fares", () => {
  it("matches the pinned tables for every type", () => {
    const pinned: [string, string, number, Record<string, number>][] = [
      [
        "bahcelievler",
        "atakule",
        6.4,
        { economy: 740, comfort: 1040, xl: 1300 },
      ],
      ["kizilay", "atakule", 5.1, { economy: 630, comfort: 890, xl: 1110 }],
    ];
    for (const [from, to, km, fares] of pinned) {
      const route = rideRoute(from as never, to as never);
      expect(route.distanceKm, `${from} → ${to}`).toBe(km);
      for (const type of RIDE_TYPES) {
        expect(rideFare(type, km), `${from} → ${to} ${type}`).toBe(fares[type]);
      }
    }
  });

  it("charges base + per km by type, rounded to 0.10 credits", () => {
    expect(RIDE_RATES).toEqual({
      economy: { label: "Economy", base: 200, perKm: 85, seats: 4 },
      comfort: { label: "Comfort", base: 300, perKm: 115, seats: 4 },
      xl: { label: "XL", base: 400, perKm: 140, seats: 6 },
    });
    expect(rideFare("economy", 0)).toBe(200);
    expect(rideFare("economy", 1)).toBe(290); // 285 rounds up
    expect(rideFare("comfort", 33.8)).toBe(4190); // 300 + 3887
    expect(roundToTen(634)).toBe(630);
    expect(roundToTen(635)).toBe(640);
  });

  it("is the same whatever the direction", () => {
    expect(rideRoute("atakule", "kizilay").distanceKm).toBe(5.1);
  });

  it("refuses a route to the same place or an unknown one", () => {
    expect(() => rideRoute("kizilay", "kizilay")).toThrow();
    expect(() => rideRoute("kizilay", "moon" as never)).toThrow();
  });
});

describe("trip minutes", () => {
  it("are 1.5 per km, between 3 and 12", () => {
    expect(tripMinutes(5.1)).toBe(8);
    expect(tripMinutes(6.4)).toBe(10);
    expect(tripMinutes(1)).toBe(3);
    expect(tripMinutes(33.8)).toBe(12);
  });
});

describe("rideQuotes", () => {
  it("prices every type and marks the ones without a free driver", () => {
    const {
      quotes,
      distanceKm,
      tripMinutes: minutes,
    } = rideQuotes("kizilay", "atakule", (type) => type !== "comfort");
    expect(distanceKm).toBe(5.1);
    expect(minutes).toBe(8);
    expect(quotes).toEqual([
      {
        type: "economy",
        label: "Economy",
        seats: 4,
        fare: 630,
        pickupMinutes: quotedPickupMinutes("kizilay", "economy"),
        available: true,
      },
      {
        type: "comfort",
        label: "Comfort",
        seats: 4,
        fare: 890,
        pickupMinutes: null,
        available: false,
      },
      {
        type: "xl",
        label: "XL",
        seats: 6,
        fare: 1110,
        pickupMinutes: quotedPickupMinutes("kizilay", "xl"),
        available: true,
      },
    ]);
  });
});

describe("schedule", () => {
  const route = { pickupMinutes: 3, tripMinutes: 8 };

  it("takes real minutes at scale 1", () => {
    expect(rideSchedule(T0, { ...route, timeScale: 1 })).toEqual({
      requestedAt: T0.toISOString(),
      driverAssignedAt: at(10 * SECOND).toISOString(),
      pickupAt: at(10 * SECOND + 3 * MINUTE).toISOString(),
      dropoffAt: at(10 * SECOND + 11 * MINUTE).toISOString(),
    });
  });

  it("keeps the 30 s cancel window and a 3 s match at scale 60", () => {
    const schedule = rideSchedule(T0, { ...route, timeScale: 60 });
    expect(schedule).toEqual({
      requestedAt: T0.toISOString(),
      driverAssignedAt: at(3 * SECOND).toISOString(),
      pickupAt: at(MIN_CANCEL_WINDOW_MS).toISOString(),
      dropoffAt: at(MIN_CANCEL_WINDOW_MS + 8 * SECOND).toISOString(),
    });
    expect(MIN_CANCEL_WINDOW_MS).toBe(30 * SECOND);
  });

  it("never shrinks the floors, even at the fastest scale", () => {
    for (const timeScale of [1, 2, 10, 60, 600]) {
      for (const pickupMinutes of [2, 5]) {
        const schedule = rideSchedule(T0, {
          pickupMinutes,
          tripMinutes: 3,
          timeScale,
        });
        const offset = (iso: string) => Date.parse(iso) - T0.getTime();
        expect(offset(schedule.driverAssignedAt)).toBeGreaterThanOrEqual(
          3 * SECOND
        );
        expect(offset(schedule.pickupAt)).toBeGreaterThanOrEqual(
          MIN_CANCEL_WINDOW_MS
        );
        expect(offset(schedule.pickupAt)).toBeGreaterThan(
          offset(schedule.driverAssignedAt)
        );
        expect(offset(schedule.dropoffAt)).toBeGreaterThan(
          offset(schedule.pickupAt)
        );
      }
    }
  });
});

describe("matching", () => {
  it("picks the same driver for the same operation, whatever the order", () => {
    for (let i = 0; i < 20; i++) {
      const id = `ride-${i}`;
      expect(pickDriver([ahmet, elif], id)).toBe(pickDriver([elif, ahmet], id));
    }
  });

  it("spreads operations over every free driver", () => {
    const picked = new Set(
      Array.from(
        { length: 50 },
        (_, i) => pickDriver([ahmet, elif], `ride-${i}`)!.username
      )
    );
    expect(picked).toEqual(new Set(["ahmet_drives", "elif_rides"]));
    expect(pickDriver([], "ride-1")).toBeNull();
  });

  it("offers only active, unfrozen, free drivers of the type, never the rider", () => {
    const zeynep = driver("zeynep_xl", "Zeynep Arslan", "xl");
    const sleeping = { ...driver("can_off", "Can"), active: false };
    const pool = [elif, ahmet, zeynep, sleeping];
    const none = () => false;

    expect(
      eligibleDrivers(pool, { type: "economy", frozen: none, busy: none }).map(
        (d) => d.username
      )
    ).toEqual(["ahmet_drives", "elif_rides"]);
    expect(
      eligibleDrivers(pool, {
        type: "economy",
        rider: "AHMET_DRIVES",
        frozen: none,
        busy: none,
      }).map((d) => d.username)
    ).toEqual(["elif_rides"]);
    expect(
      eligibleDrivers(pool, {
        type: "economy",
        frozen: (d) => d.username === "elif_rides",
        busy: (d) => d.username === "ahmet_drives",
      })
    ).toEqual([]);
  });

  it("quotes a wait that differs between ride types", () => {
    const waits = new Set(
      ["kizilay", "ulus", "odtu"].flatMap((from) =>
        RIDE_TYPES.map((type) => quotedPickupMinutes(from as never, type))
      )
    );
    expect(waits.size).toBeGreaterThan(1);
  });

  it("waits 2 to 5 minutes for the driver, fixed per operation", () => {
    const waits = new Set(
      Array.from({ length: 60 }, (_, i) => pickupMinutes(`ride-${i}`))
    );
    expect(waits).toEqual(new Set([2, 3, 4, 5]));
    expect(pickupMinutes("ride-x")).toBe(pickupMinutes("ride-x"));
    expect(quotedPickupMinutes("kizilay", "xl")).toBeGreaterThanOrEqual(2);
    expect(quotedPickupMinutes("kizilay", "xl")).toBeLessThanOrEqual(5);
  });

  it("hashes stably and codes rides with unambiguous characters", () => {
    const hashes = ["", "ride-1", "kizilay:economy"].map(stableHash);
    for (const hash of hashes) {
      expect(Number.isInteger(hash) && hash >= 0 && hash < 2 ** 32).toBe(true);
    }
    expect(stableHash("ride-1")).toBe(stableHash("ride-1"));
    expect(stableHash("ride-1")).not.toBe(stableHash("ride-2"));
    expect(rideCode("seed-ride01")).toMatch(/^[2-9A-HJ-NP-Z]{4}$/);
    expect(rideCode("seed-ride01")).toBe(rideCode("seed-ride01"));
  });
});

describe("planRide", () => {
  it("books a ride and holds its fare for the driver until pickup", () => {
    const { ride, payment } = book();
    const expectedDriver = pickDriver([ahmet, elif], newRide().operationId)!;

    expect(ride).toMatchObject({
      id: newRide().operationId,
      rider,
      driver: {
        username: expectedDriver.username,
        fullname: expectedDriver.fullname,
        image: null,
        vehicle: expectedDriver.vehicle,
        rideType: "economy",
        seats: 4,
      },
      from: "kizilay",
      to: "atakule",
      type: "economy",
      fare: 630,
      distanceKm: 5.1,
      requestedAt: T0.toISOString(),
      cancelledAt: null,
      paymentTransferId: `${newRide().operationId}-1`,
      refundTransferId: null,
      requestHash: "hash",
    });
    expect(ride.code).toBe(rideCode(ride.id));
    expect(payment).toEqual({
      id: ride.paymentTransferId,
      kind: "ride",
      from: rider,
      to: {
        username: expectedDriver.username,
        fullname: expectedDriver.fullname,
        image: null,
      },
      amount: 630,
      note: null,
      context: { type: "ride", id: ride.id, code: ride.code },
      holdUntil: ride.pickupAt,
      reverses: null,
    });
  });

  it("refuses a second active ride, a stale fare and a type with no free driver", () => {
    expect(() => book({}, { activeRides: 1 })).toThrow(InvalidStateError);
    try {
      book({ expectedFare: 600 });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PriceChangedError);
      expect(error).toMatchObject({
        expected: 600,
        actual: 630,
        message: "The fare changed. Check the new price and book again.",
      });
    }
    expect(() => book({}, { candidates: [] })).toThrow(UnavailableError);
    expect(() => book({}, { candidates: [] })).toThrow(
      "No Economy drivers are free nearby"
    );
  });

  it("never makes the rider their own driver", () => {
    const asAhmet = book({ rider: author("ahmet_drives") });
    expect(asAhmet.ride.driver.username).toBe("elif_rides");
    expect(() =>
      book({ rider: author("Ahmet_Drives") }, { candidates: [ahmet] })
    ).toThrow(UnavailableError);
  });
});

describe("a ride over time", () => {
  const stored: StoredRide = {
    ...book().ride,
    driver: { ...ahmet },
  };
  const { requestedAt, driverAssignedAt, pickupAt, dropoffAt } = stored;
  const offset = (iso: string, ms = 0) => new Date(Date.parse(iso) + ms);

  it("moves through its stages with the clock", () => {
    const finding = toRide(stored, offset(requestedAt));
    expect(finding).toMatchObject({
      status: "finding",
      eta: pickupAt,
      nextChangeAt: driverAssignedAt,
      progress: { leg: null, fraction: 0 },
      canCancel: true,
    });
    expect(
      finding.stages.map((stage) => [stage.status, stage.label, stage.reached])
    ).toEqual([
      ["finding", "Finding your driver", true],
      ["arriving", "Ahmet is on the way", false],
      ["on_trip", "Picked up", false],
      ["completed", "Arrived at Atakule", false],
    ]);

    const halfway = (Date.parse(pickupAt) - Date.parse(driverAssignedAt)) / 2;
    expect(toRide(stored, offset(driverAssignedAt, halfway))).toMatchObject({
      status: "arriving",
      eta: pickupAt,
      nextChangeAt: pickupAt,
      progress: { leg: "pickup", fraction: 0.5 },
      canCancel: true,
    });

    expect(toRide(stored, offset(pickupAt))).toMatchObject({
      status: "on_trip",
      eta: dropoffAt,
      nextChangeAt: dropoffAt,
      progress: { leg: "trip", fraction: 0 },
      canCancel: false,
    });

    expect(toRide(stored, offset(dropoffAt))).toMatchObject({
      status: "completed",
      eta: null,
      nextChangeAt: null,
      progress: { leg: null, fraction: 1 },
      canCancel: false,
    });
    expect(isActiveRide(stored, offset(dropoffAt, -1))).toBe(true);
    expect(isActiveRide(stored, offset(dropoffAt))).toBe(false);
  });

  it("stops at a cancellation", () => {
    const cancelledAt = offset(driverAssignedAt, 1_000).toISOString();
    const cancelled = { ...stored, cancelledAt };
    const ride = toRide(cancelled, offset(dropoffAt, MINUTE));
    expect(ride).toMatchObject({
      status: "cancelled",
      eta: null,
      nextChangeAt: null,
      progress: { leg: null, fraction: 0 },
      canCancel: false,
    });
    expect(ride.stages.map((stage) => stage.status)).toEqual([
      "finding",
      "arriving",
      "cancelled",
    ]);
    expect(isActiveRide(cancelled, offset(requestedAt))).toBe(false);
  });

  it("refunds the fare before pickup only", () => {
    expect(planRideRefund(stored, offset(pickupAt, -1))).toEqual({
      id: `refund-${stored.paymentTransferId}`,
      kind: "ride_refund",
      from: author("ahmet_drives", "Ahmet Kaya"),
      to: rider,
      amount: 630,
      note: null,
      context: { type: "ride", id: stored.id, code: stored.code },
      holdUntil: null,
      reverses: stored.paymentTransferId,
    });
    expect(() => planRideRefund(stored, offset(pickupAt))).toThrow(
      InvalidStateError
    );
  });

  it("tells the rider it is complete once the drop-off is due", () => {
    expect(rideNotification(stored, offset(dropoffAt, -1))).toBeNull();
    expect(rideNotification(stored, offset(dropoffAt))).toEqual({
      id: `ride-completed-${stored.id}`,
      type: "ride",
      event: "completed",
      createdAt: dropoffAt,
      actor: author("ahmet_drives", "Ahmet Kaya"),
      rideId: stored.id,
      destination: "Atakule",
    });
    expect(
      rideNotification(
        { ...stored, cancelledAt: requestedAt },
        offset(dropoffAt)
      )
    ).toBeNull();
  });

  it("shows what is happening as live activity", () => {
    const live = (ms: number) =>
      rideActivity(toRide(stored, offset(requestedAt, ms)));
    expect(live(0)).toEqual({
      kind: "ride",
      id: stored.id,
      title: "Ride to Atakule",
      status: "Finding your driver",
      eta: pickupAt,
      href: `/rides/${stored.id}`,
      nextChangeAt: driverAssignedAt,
    });
    expect(rideActivity(toRide(stored, offset(driverAssignedAt))).status).toBe(
      "Ahmet is on the way"
    );
    expect(rideActivity(toRide(stored, offset(pickupAt)))).toMatchObject({
      status: "On the way to Atakule",
      eta: dropoffAt,
    });
  });

  it("lets only the rider tip, once the ride is complete", () => {
    const key = { operationId: "tx-1", fingerprint: "f" };
    const done = toRide(stored, offset(dropoffAt));
    expect(planRideTip(done, rider, 200, key)).toEqual({
      ...key,
      kind: "tip",
      from: rider,
      to: author("ahmet_drives", "Ahmet Kaya"),
      amount: 200,
      note: null,
      context: { type: "ride", id: stored.id, code: stored.code },
    });
    expect(() =>
      planRideTip(toRide(stored, offset(pickupAt)), rider, 200, key)
    ).toThrow(InvalidStateError);
    expect(() => planRideTip(done, author("ahmet_drives"), 200, key)).toThrow(
      ForbiddenError
    );
  });
});

describe("policy", () => {
  const ride = { rider: author("IllhanOzkan"), driver: { ...ahmet } };

  it("shows a ride to its rider and driver only, in any case", () => {
    expect(canViewRide("illhanozkan", ride)).toBe(true);
    expect(canViewRide("AHMET_DRIVES", ride)).toBe(true);
    expect(canViewRide("sarahcodes", ride)).toBe(false);
  });

  it("lets only the rider cancel or tip", () => {
    expect(canCancelRide("illhanozkan", ride)).toBe(true);
    expect(canCancelRide("ahmet_drives", ride)).toBe(false);
    expect(canTipRide("illhanozkan", ride)).toBe(true);
    expect(canTipRide("ahmet_drives", ride)).toBe(false);
  });
});

describe("rideMapLabel", () => {
  it("names both places and the distance", () => {
    expect(rideMapLabel(getPlace("kizilay"), getPlace("atakule"), 5.1)).toBe(
      "Map from Kızılay to Atakule, 5.1 km"
    );
    expect(rideMapLabel(getPlace("kizilay"), getPlace("esenboga"), 34)).toBe(
      "Map from Kızılay to Esenboğa Airport, 34.0 km"
    );
  });
});

describe("rideAt", () => {
  const stored: StoredRide = { ...book().ride, driver: { ...ahmet } };

  it("re-derives the API's ride at another moment exactly as the server would", () => {
    const sent = toRide(stored, T0);
    for (const ms of [0, 5 * SECOND, 40 * SECOND, 4 * MINUTE, 30 * MINUTE]) {
      expect(rideAt(sent, at(ms))).toEqual(toRide(stored, at(ms)));
    }
  });

  it("keeps a cancellation, whatever the clock", () => {
    const cancelled = { ...stored, cancelledAt: at(10 * SECOND).toISOString() };
    const sent = toRide(cancelled, at(20 * SECOND));
    expect(rideAt(sent, at(30 * MINUTE))).toMatchObject({
      status: "cancelled",
      canCancel: false,
      nextChangeAt: null,
      progress: { leg: null },
    });
  });
});

describe("bookingRoute", () => {
  it("starts from the city centre to Atakule", () => {
    expect(bookingRoute({})).toEqual({ from: "kizilay", to: "atakule" });
  });

  it("takes ?to= (Ride here) and moves the pickup out of its way", () => {
    expect(bookingRoute({ to: "esenboga" })).toEqual({
      from: "kizilay",
      to: "esenboga",
    });
    expect(bookingRoute({ to: "kizilay" })).toEqual({
      from: "tunali",
      to: "kizilay",
    });
  });

  it("takes both for Book again, and a lone ?from= too", () => {
    expect(bookingRoute({ from: "bahcelievler", to: "atakule" })).toEqual({
      from: "bahcelievler",
      to: "atakule",
    });
    expect(bookingRoute({ from: "atakule" })).toEqual({
      from: "atakule",
      to: "kizilay",
    });
    expect(bookingRoute({ from: "ulus" })).toEqual({
      from: "ulus",
      to: "atakule",
    });
  });

  it("ignores unknown places, lists and a pickup equal to the destination", () => {
    expect(bookingRoute({ to: "mars", from: ["kizilay"] })).toEqual({
      from: "kizilay",
      to: "atakule",
    });
    expect(bookingRoute({ from: "odtu", to: "odtu" })).toEqual({
      from: "kizilay",
      to: "odtu",
    });
  });
});
