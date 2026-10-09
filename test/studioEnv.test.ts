import { describe, expect, it } from "vitest";

import { SANITY_API_VERSION } from "../lib/config";
import {
  RESERVED_USERNAMES,
  TWEET_MAX_LENGTH,
  USERNAME_PATTERN,
} from "../lib/constants";
import { KEY_PATTERN } from "../lib/db/sanity/ids";
import { seedToSanityDocuments } from "../lib/db/sanity/seed";
import { createSeedData } from "../lib/db/seed";
import { LIMITS } from "../lib/superapp/limits";
import { PLACES } from "../lib/superapp/places";
import * as studio from "../sanity/env";
import { BusinessCategory } from "../types/Business";
import {
  PaymentRequestStatus,
  TransferContext,
  TransferKind,
} from "../types/Wallet";

// The Studio is a separate package, so sanity/env.ts restates the app's
// limits and lists instead of importing them. These tests keep the copies
// equal, so Studio validation never accepts what the app rejects (or the
// other way round).

// Records with every member of each union: the compiler fails here when a
// value is added to or removed from the app's types.
const BUSINESS_CATEGORIES: Record<BusinessCategory, true> = {
  cafe: true,
  restaurant: true,
  healthy: true,
  shop: true,
};
const TRANSFER_KINDS: Record<TransferKind, true> = {
  issue: true,
  payment: true,
  tip: true,
  request: true,
  order: true,
  order_refund: true,
  ride: true,
  ride_refund: true,
};
const CONTEXT_TYPES: Record<TransferContext["type"], true> = {
  tweet: true,
  conversation: true,
  request: true,
  order: true,
  ride: true,
};
const STORED_STATUSES: Record<
  Exclude<PaymentRequestStatus, "expired">,
  true
> = { pending: true, paid: true, declined: true, cancelled: true };

const sorted = (values: Iterable<string>) => [...values].sort();

describe("sanity/env.ts mirrors the app", () => {
  it("uses the same API version", () => {
    expect(studio.apiVersion).toBe(SANITY_API_VERSION);
  });

  it("has the same text and username rules", () => {
    expect(studio.TWEET_MAX_LENGTH).toBe(TWEET_MAX_LENGTH);
    expect(studio.USERNAME_PATTERN.source).toBe(USERNAME_PATTERN.source);
    expect(studio.KEY_PATTERN.source).toBe(KEY_PATTERN.source);
    expect(sorted(studio.RESERVED_USERNAMES)).toEqual(
      sorted(RESERVED_USERNAMES)
    );
  });

  it("has every SuperApp limit", () => {
    expect(studio.LIMITS).toEqual(LIMITS);
  });

  it("lists the same places", () => {
    expect(studio.PLACES).toEqual(PLACES.map(({ id, name }) => ({ id, name })));
  });

  it("lists every business category, transfer kind and stored request status", () => {
    expect(
      sorted(studio.BUSINESS_CATEGORIES.map(({ value }) => value))
    ).toEqual(sorted(Object.keys(BUSINESS_CATEGORIES)));
    expect(sorted(studio.TRANSFER_KINDS)).toEqual(
      sorted(Object.keys(TRANSFER_KINDS))
    );
    expect(sorted(studio.TRANSFER_CONTEXT_TYPES)).toEqual(
      sorted(Object.keys(CONTEXT_TYPES))
    );
    expect(sorted(studio.STORED_REQUEST_STATUSES)).toEqual(
      sorted(Object.keys(STORED_STATUSES))
    );
  });
});

describe("seeded documents pass the Studio's rules", () => {
  const documents = seedToSanityDocuments(
    createSeedData(new Date("2026-03-01T12:00:00Z"), { world: "superapp" })
  );
  const ofType = (type: string) =>
    documents.filter((document) => document._type === type);
  const length = (value: unknown) => Array.from(String(value ?? "")).length;

  it("business profiles", () => {
    const profiles = ofType("businessProfile");
    const limits = studio.STUDIO_LIMITS.business;
    const places = new Set(studio.PLACES.map(({ id }) => id));
    const categories = new Set(
      studio.BUSINESS_CATEGORIES.map(({ value }) => value)
    );
    expect(profiles.length).toBeGreaterThan(0);

    for (const profile of profiles) {
      expect(profile.username).toMatch(studio.USERNAME_PATTERN);
      expect(categories.has(String(profile.category))).toBe(true);
      expect(places.has(String(profile.placeId))).toBe(true);
      expect(profile.opens).toMatch(studio.HOURS_PATTERN);
      expect(profile.closes).toMatch(studio.HOURS_PATTERN);
      expect(
        () =>
          new Intl.DateTimeFormat("en-US", {
            timeZone: String(profile.timeZone),
          })
      ).not.toThrow();
      expect(length(profile.description)).toBeLessThanOrEqual(
        limits.descriptionMax
      );
      expect(length(profile.address)).toBeGreaterThan(0);
      expect(length(profile.address)).toBeLessThanOrEqual(limits.addressMax);
      expect(length(profile.greeting)).toBeLessThanOrEqual(limits.greetingMax);
      for (const field of ["prepMinutes", "deliveryMinutes"]) {
        expect(Number.isInteger(profile[field])).toBe(true);
        expect(profile[field]).toBeLessThanOrEqual(limits.minutesMax);
      }
      for (const field of ["deliveryFee", "minimumOrder"]) {
        expect(Number.isInteger(profile[field])).toBe(true);
        expect(profile[field]).toBeLessThanOrEqual(
          studio.LIMITS.order.maxTotal
        );
      }
      for (const manager of profile.managers as string[]) {
        expect(manager).toMatch(studio.USERNAME_PATTERN);
      }
    }
  });

  it("users", () => {
    const reserved = new Set(studio.RESERVED_USERNAMES);
    for (const user of ofType("user")) {
      expect(reserved.has(String(user.username).toLowerCase())).toBe(false);
      expect(["personal", "business", undefined]).toContain(user.accountType);
    }
  });

  it("ledger records", () => {
    const kinds = new Set(studio.TRANSFER_KINDS);
    const contexts = new Set(studio.TRANSFER_CONTEXT_TYPES);
    const statuses = new Set(studio.STORED_REQUEST_STATUSES);

    for (const transfer of ofType("transfer")) {
      expect(kinds.has(String(transfer.kind))).toBe(true);
      const context = transfer.context as { type: string } | undefined;
      if (context) expect(contexts.has(context.type)).toBe(true);
    }
    for (const request of ofType("paymentRequest")) {
      expect(statuses.has(String(request.status))).toBe(true);
    }
  });
});
