import {
  pickupMinutes,
  rideCode,
  rideFare,
  rideRoute,
  rideSchedule,
} from "../../superapp/rides";
import { IDriver } from "../../../types/Ride";
import { IAuthor } from "../../../types/User";
import { DriverProfile, StoredRide } from "../rides/types";
import { createCoreSeed, DEMO_USERNAME } from "./core";
import { LaneSeed, SeedContext } from "./types";
import { superappUsers } from "./users";

/** The rides world: driver profiles and past trips. */
export interface RidesSeed {
  drivers: DriverProfile[];
  rides: StoredRide[];
}

const DAY = 24 * 60;

const DRIVERS: DriverProfile[] = [
  {
    username: "ahmet_drives",
    vehicle: {
      make: "Toyota",
      model: "Corolla",
      color: "White",
      plate: "06 AK 1234",
    },
    rideType: "economy",
    seats: 4,
    active: true,
  },
  {
    username: "elif_rides",
    vehicle: {
      make: "Renault",
      model: "Clio",
      color: "Grey",
      plate: "06 EL 4521",
    },
    rideType: "economy",
    seats: 4,
    active: true,
  },
  {
    username: "canwheels",
    vehicle: {
      make: "Skoda",
      model: "Superb",
      color: "Black",
      plate: "06 CN 7788",
    },
    rideType: "comfort",
    seats: 4,
    active: true,
  },
  {
    username: "zeynep_xl",
    vehicle: {
      make: "Ford",
      model: "Tourneo",
      color: "Blue",
      plate: "06 ZY 3030",
    },
    rideType: "xl",
    seats: 6,
    active: true,
  },
];

/**
 * D's part of the world: four drivers, the demo user's completed trip from
 * Bahçelievler to Atakule two days ago (7.40 credits to Ahmet, long past
 * its refund window) and Ahmet's hello Tweet. Seeds use time scale 1.
 */
export function createRidesSeed(ctx: SeedContext): LaneSeed<RidesSeed> {
  const users = [...createCoreSeed(ctx).users, ...superappUsers];
  const authorOf = (username: string): IAuthor => {
    const user = users.find((candidate) => candidate.username === username);
    if (!user) throw new Error(`Rides seed references unknown "${username}"`);
    return {
      username: user.username,
      fullname: user.fullname,
      image: user.image,
    };
  };
  const driverOf = (username: string): IDriver => {
    const profile = DRIVERS.find((driver) => driver.username === username)!;
    return {
      ...authorOf(username),
      vehicle: { ...profile.vehicle },
      rideType: profile.rideType,
      seats: profile.seats,
    };
  };

  const id = "seed-ride01";
  const route = rideRoute("bahcelievler", "atakule");
  const schedule = rideSchedule(new Date(ctx.at(2 * DAY + 14)), {
    pickupMinutes: pickupMinutes(id),
    tripMinutes: route.tripMinutes,
    timeScale: 1,
  });
  const ride: StoredRide = {
    id,
    code: rideCode(id),
    rider: authorOf(DEMO_USERNAME),
    driver: driverOf("ahmet_drives"),
    from: route.from.id,
    to: route.to.id,
    type: "economy",
    fare: rideFare("economy", route.distanceKm),
    distanceKm: route.distanceKm,
    ...schedule,
    cancelledAt: null,
    paymentTransferId: "seed-tx-ride01",
    refundTransferId: null,
    requestHash: null,
  };

  return {
    data: {
      drivers: DRIVERS.map((driver) => structuredClone(driver)),
      rides: [ride],
    },
    contribution: {
      tweets: [
        {
          id: "seed-t26",
          text: "10 years driving in Ankara, now on SuperApp Rides. Kızılay to the airport in under 40 minutes if traffic allows 🚗",
          image: null,
          createdAt: ctx.at(3 * DAY),
          author: "ahmet_drives",
          blocked: false,
        },
      ],
      transfers: [
        {
          id: ride.paymentTransferId,
          kind: "ride",
          from: DEMO_USERNAME,
          to: "ahmet_drives",
          amount: ride.fare,
          note: null,
          context: { type: "ride", id, code: ride.code },
          holdUntil: ride.pickupAt,
          reverses: null,
          createdAt: ride.requestedAt,
        },
      ],
    },
  };
}
