import { defineField, defineType, getPublishedId } from "sanity";
import type { StructureBuilder } from "sanity/structure";

import {
  apiVersion,
  BUSINESS_CATEGORIES,
  HOURS_PATTERN,
  LIMITS,
  PLACES,
  STUDIO_LIMITS,
  USERNAME_PATTERN,
} from "../env";
import { centsField } from "./fields";
import { imageUrl, maxLength, username } from "./rules";

const { business: limits } = STUDIO_LIMITS;

// A business is a user with `accountType: "business"` plus one of these
// profiles (matched by username, case-insensitively). Its name and avatar
// always come from the user. Profiles are live-edited: the app's "Accepting
// orders" switch patches the published document, which a later publish of
// an older Studio draft would otherwise overwrite.

const minutes = (name: string, title: string, description: string) =>
  defineField({
    name,
    title,
    description,
    type: "number",
    validation: (rule) =>
      rule.required().integer().min(0).max(limits.minutesMax),
  });

const time = (name: string, title: string) =>
  defineField({
    name,
    title,
    description:
      '24-hour "HH:MM" in the time zone below. Closing before opening runs past midnight; the same time means open 24 hours.',
    type: "string",
    validation: (rule) =>
      rule.required().regex(HOURS_PATTERN, { name: "time (HH:MM)" }),
  });

const businessProfileType = defineType({
  name: "businessProfile",
  title: "Business",
  type: "document",
  liveEdit: true,
  fields: [
    defineField({
      name: "username",
      title: "Username",
      description:
        'The business account. Its user must have the account type "Business"; its name and avatar come from there.',
      type: "string",
      validation: (rule) => [
        username(rule).custom(async (value, context) => {
          if (!value) return true;
          const published = getPublishedId(context.document?._id ?? "");
          const ids = await context
            .getClient({ apiVersion })
            .fetch<string[]>(
              `*[_type == "businessProfile" && lower(username) == $username]._id`,
              { username: value.toLowerCase() }
            );
          return ids.some((id) => getPublishedId(id) !== published)
            ? "This account already has a business profile"
            : true;
        }),
        rule
          .custom(async (value, context) => {
            if (!value) return true;
            const types = await context
              .getClient({ apiVersion })
              .fetch<(string | null)[]>(
                `*[_type == "user" && lower(username) == $username].accountType`,
                { username: value.toLowerCase() }
              );
            if (types.length === 0) return "No user has this username";
            return types.includes("business")
              ? true
              : 'Set this user\'s account type to "Business", or the app ignores this profile';
          })
          .warning(),
      ],
    }),
    defineField({
      name: "category",
      title: "Category",
      type: "string",
      options: { list: [...BUSINESS_CATEGORIES], layout: "radio" },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "text",
      rows: 2,
      validation: (rule) => maxLength(rule, limits.descriptionMax),
    }),
    defineField({
      name: "placeId",
      title: "Place",
      description: "Where it is on the app's map.",
      type: "string",
      options: {
        list: PLACES.map(({ id, name }) => ({ value: id, title: name })),
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "address",
      title: "Address",
      type: "string",
      validation: (rule) => maxLength(rule.required(), limits.addressMax),
    }),
    time("opens", "Opens"),
    time("closes", "Closes"),
    defineField({
      name: "timeZone",
      title: "Time zone",
      description: "An IANA time zone such as Europe/Istanbul.",
      type: "string",
      initialValue: "Europe/Istanbul",
      validation: (rule) =>
        rule.required().custom((value) => {
          if (!value) return true;
          try {
            new Intl.DateTimeFormat("en-US", { timeZone: value });
            return true;
          } catch {
            return "Unknown time zone";
          }
        }),
    }),
    defineField({
      name: "acceptingOrders",
      title: "Accepting orders",
      description:
        "The business's managers switch this in the app (Business page).",
      type: "boolean",
      initialValue: true,
    }),
    minutes(
      "prepMinutes",
      "Preparation (minutes)",
      "How long an order takes to prepare (demo time)."
    ),
    minutes(
      "deliveryMinutes",
      "Delivery (minutes)",
      "How long delivery takes (demo time)."
    ),
    defineField({
      ...centsField("deliveryFee", "Delivery fee"),
      initialValue: 0,
      validation: (rule) =>
        rule.required().integer().min(0).max(LIMITS.order.maxTotal),
    }),
    defineField({
      ...centsField("minimumOrder", "Minimum order"),
      initialValue: 0,
      validation: (rule) =>
        rule.required().integer().min(0).max(LIMITS.order.maxTotal),
    }),
    defineField({
      name: "greeting",
      title: "Greeting",
      description:
        "Sent automatically when someone opens a conversation with the business. Say that it is automatic; don't promise a reply.",
      type: "text",
      rows: 2,
      validation: (rule) => maxLength(rule, limits.greetingMax),
    }),
    defineField({
      name: "managers",
      title: "Managers",
      description:
        "Usernames of people who can run the business in the app, besides the account itself.",
      type: "array",
      of: [
        defineField({
          name: "manager",
          type: "string",
          validation: (rule) =>
            rule.regex(USERNAME_PATTERN, {
              name: "handle (letters, digits and _, at most 15 characters)",
            }),
        }),
      ],
      options: { layout: "tags" },
      validation: (rule) => rule.unique(),
    }),
    defineField({
      name: "banner",
      title: "Banner image",
      type: "url",
      validation: imageUrl,
    }),
  ],
  preview: {
    select: {
      username: "username",
      category: "category",
      accepting: "acceptingOrders",
    },
    prepare({ username, category, accepting }) {
      const label = BUSINESS_CATEGORIES.find(
        ({ value }) => value === category
      )?.title;
      return {
        title: `@${username ?? "unknown"}`,
        subtitle: [label, accepting === false ? "paused" : null]
          .filter(Boolean)
          .join(" · "),
      };
    },
  },
});

export const types = [businessProfileType];

/** The first entry of the "Food" group. */
export function structureItems(S: StructureBuilder) {
  return [S.documentTypeListItem("businessProfile").title("Businesses")];
}

export const APP_CREATED_TYPES: string[] = [];
export const LOCKED_TYPES: string[] = [];
export const MODERATED_TYPES: string[] = [];
