import { defineField, defineType, getPublishedId } from "sanity";
import type { StructureBuilder } from "sanity/structure";

import { apiVersion, PLACES } from "../env";
import {
  centsField,
  formatCredits,
  partyField,
  requestHashField,
  timestampField,
  usernameKeyField,
} from "./fields";
import { maxLength, username } from "./rules";

// Rides (docs/features/rides.md). A driver is a user plus one driverProfile
// (matched by username, case-insensitively); its name and avatar come from
// the user. Rides and driver locks are private records only the app writes:
// a ride's fare is a held credit in the ledger, and the lock is what stops
// two bookings from taking the same driver, so both are locked here.

/** types/Ride.ts RideType, with the app's labels and seats (lib/superapp/rides.ts). */
const RIDE_TYPES = [
  { value: "economy", title: "Economy" },
  { value: "comfort", title: "Comfort" },
  { value: "xl", title: "XL" },
];

const PLACE_OPTIONS = PLACES.map(({ id, name }) => ({
  value: id,
  title: name,
}));

const text = (name: string, title: string, max: number) =>
  defineField({
    name,
    title,
    type: "string",
    validation: (rule) => maxLength(rule.required(), max),
  });

const vehicleField = defineField({
  name: "vehicle",
  title: "Vehicle",
  description: 'Shown to riders as "White Toyota Corolla" with the plate.',
  type: "object",
  options: { collapsible: false },
  fields: [
    text("make", "Make", 30),
    text("model", "Model", 30),
    text("color", "Colour", 20),
    text("plate", "Plate", 15),
  ],
  validation: (rule) => rule.required(),
});

const driverProfileType = defineType({
  name: "driverProfile",
  title: "Driver",
  type: "document",
  // Live-edited, so switching a driver off takes effect at once.
  liveEdit: true,
  fields: [
    defineField({
      name: "username",
      title: "Username",
      description:
        "The driver's account; its name and avatar come from there. Drivers have no ratings.",
      type: "string",
      validation: (rule) => [
        username(rule).custom(async (value, context) => {
          if (!value) return true;
          const published = getPublishedId(context.document?._id ?? "");
          const ids = await context
            .getClient({ apiVersion })
            .fetch<string[]>(
              `*[_type == "driverProfile" && lower(username) == $username]._id`,
              { username: value.toLowerCase() }
            );
          return ids.some((id) => getPublishedId(id) !== published)
            ? "This account already has a driver profile"
            : true;
        }),
        rule
          .custom(async (value, context) => {
            if (!value) return true;
            const found = await context
              .getClient({ apiVersion })
              .fetch<number>(
                `count(*[_type == "user" && lower(username) == $username])`,
                { username: value.toLowerCase() }
              );
            return found > 0
              ? true
              : "No user has this username, so the app ignores this driver";
          })
          .warning(),
      ],
    }),
    vehicleField,
    defineField({
      name: "rideType",
      title: "Ride type",
      type: "string",
      options: { list: RIDE_TYPES, layout: "radio" },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "seats",
      title: "Seats",
      description: "Passenger seats; XL cars usually have 6.",
      type: "number",
      initialValue: 4,
      validation: (rule) => rule.required().integer().min(1).max(8),
    }),
    defineField({
      name: "active",
      title: "Active",
      description:
        "Only active drivers are offered to riders. Trips in progress are not affected.",
      type: "boolean",
      initialValue: true,
    }),
  ],
  preview: {
    select: {
      username: "username",
      rideType: "rideType",
      make: "vehicle.make",
      model: "vehicle.model",
      plate: "vehicle.plate",
      active: "active",
    },
    prepare({ username, rideType, make, model, plate, active }) {
      const type = RIDE_TYPES.find(({ value }) => value === rideType)?.title;
      return {
        title: `@${username ?? "unknown"}`,
        subtitle: [type, [make, model].filter(Boolean).join(" "), plate]
          .concat(active === false ? ["inactive"] : [])
          .filter(Boolean)
          .join(" · "),
      };
    },
  },
});

const placeField = (name: string, title: string) =>
  defineField({
    name,
    title,
    type: "string",
    options: { list: PLACE_OPTIONS },
  });

const rideType = defineType({
  name: "ride",
  title: "Ride",
  type: "document",
  readOnly: true,
  fields: [
    defineField({
      name: "code",
      title: "Code",
      description: "Shown to the rider; the id is the identity.",
      type: "string",
    }),
    partyField("rider", "Rider"),
    usernameKeyField("riderKey", "Rider (key)"),
    defineField({
      name: "driver",
      title: "Driver",
      description: "The driver and car as they were when the ride was booked.",
      type: "object",
      options: { collapsible: false },
      fields: [
        defineField({ name: "username", title: "Username", type: "string" }),
        defineField({ name: "fullname", title: "Full name", type: "string" }),
        defineField({ name: "image", title: "Profile image", type: "url" }),
        defineField({
          name: "vehicle",
          title: "Vehicle",
          type: "object",
          fields: ["make", "model", "color", "plate"].map((name) =>
            defineField({ name, type: "string" })
          ),
        }),
        defineField({
          name: "rideType",
          title: "Ride type",
          type: "string",
          options: { list: RIDE_TYPES },
        }),
        defineField({ name: "seats", title: "Seats", type: "number" }),
      ],
    }),
    usernameKeyField("driverKey", "Driver (key)"),
    placeField("fromPlaceId", "Pickup"),
    placeField("toPlaceId", "Destination"),
    defineField({
      name: "rideType",
      title: "Ride type",
      type: "string",
      options: { list: RIDE_TYPES },
    }),
    centsField(
      "fare",
      "Fare",
      "Hundredths of a credit, paid upfront and held for the driver until pickup."
    ),
    defineField({
      name: "distanceKm",
      title: "Distance (km)",
      type: "number",
    }),
    timestampField("requestedAt", "Requested"),
    timestampField("driverAssignedAt", "Driver assigned"),
    timestampField("pickupAt", "Pickup"),
    timestampField("dropoffAt", "Drop-off"),
    timestampField("cancelledAt", "Cancelled"),
    defineField({
      name: "paymentTransferId",
      title: "Payment",
      description: "The id of the transfer that paid the fare.",
      type: "string",
    }),
    defineField({
      name: "refundTransferId",
      title: "Refund",
      description: "The id of the refund, when the ride was cancelled.",
      type: "string",
    }),
    timestampField("createdAt", "Created"),
    requestHashField,
  ],
  orderings: [
    {
      title: "Newest first",
      name: "requestedAtDesc",
      by: [{ field: "requestedAt", direction: "desc" }],
    },
  ],
  preview: {
    select: {
      code: "code",
      fare: "fare",
      rider: "rider.username",
      driver: "driver.username",
      from: "fromPlaceId",
      to: "toPlaceId",
      cancelledAt: "cancelledAt",
    },
    prepare({ code, fare, rider, driver, from, to, cancelledAt }) {
      const name = (id: string | undefined) =>
        PLACES.find((place) => place.id === id)?.name ?? id ?? "?";
      return {
        title: `${name(from)} → ${name(to)} · ${formatCredits(fare)}`,
        subtitle: [
          code,
          `@${rider ?? "unknown"} with @${driver ?? "unknown"}`,
          cancelledAt ? "cancelled" : null,
        ]
          .filter(Boolean)
          .join(" · "),
      };
    },
  },
});

// One per driver ("driverlock-<username>"): busy until `until`. Bookings
// write it under its revision, which is what makes matching exact; nobody
// browses it, so it has no desk entry.
const driverLockType = defineType({
  name: "driverLock",
  title: "Driver lock",
  type: "document",
  readOnly: true,
  fields: [
    usernameKeyField("driverKey", "Driver (key)"),
    defineField({ name: "rideId", title: "Ride", type: "string" }),
    defineField({
      name: "until",
      title: "Busy until",
      description: "The ride's drop-off, or when it was cancelled.",
      type: "datetime",
    }),
    timestampField("createdAt", "Created"),
    timestampField("updatedAt", "Updated"),
  ],
});

export const types = [driverProfileType, rideType, driverLockType];

/** The "Rides" group: Drivers, Rides. */
export function structureItems(S: StructureBuilder) {
  return [
    S.documentTypeListItem("driverProfile").title("Drivers"),
    S.listItem()
      .title("Rides")
      .schemaType("ride")
      .child(
        S.documentTypeList("ride")
          .title("Rides")
          .defaultOrdering([{ field: "requestedAt", direction: "desc" }])
      ),
  ];
}

export const APP_CREATED_TYPES = ["ride", "driverLock"];
export const LOCKED_TYPES = ["ride", "driverLock"];
export const MODERATED_TYPES: string[] = [];
