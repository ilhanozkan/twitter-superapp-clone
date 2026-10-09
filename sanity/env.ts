// SANITY_STUDIO_* variables are exposed to the Studio bundle by the Sanity CLI.
export const projectId = process.env.SANITY_STUDIO_PROJECT_ID || "am1ac7lm";
export const dataset = process.env.SANITY_STUDIO_DATASET || "production";

/** Keep in sync with SANITY_API_VERSION in the app (lib/config.ts). */
export const apiVersion = "2025-02-19";

// Everything below mirrors the app: the Studio is a separate package and
// can't import it. test/studioEnv.test.ts in the app fails when the two
// drift apart. Feature schema files read their limits from here, so adding
// a feature never needs an edit to this file.

/** lib/constants.ts */
export const TWEET_MAX_LENGTH = 280;
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{1,15}$/;
export const RESERVED_USERNAMES: readonly string[] = [
  "services",
  "wallet",
  "food",
  "checkout",
  "orders",
  "business",
  "rides",
  "stories",
  "channels",
  "messages",
  "explore",
  "notifications",
  "i",
  "api",
  "settings",
  "404",
  "500",
  "_next",
];

/** lib/db/sanity/ids.ts: the record ids the API accepts (dot-free). */
export const KEY_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;

/** lib/superapp/limits.ts. Amounts are integer cents: 450 is 4.50 credits. */
export const LIMITS = {
  payment: { min: 50, max: 20_000 },
  tip: { min: 50, max: 5_000, presets: [100, 200, 500, 1_000] },
  topUp: { amounts: [2_500, 5_000, 10_000], cap: 100_000, perDay: 3 },
  request: { pendingOutgoing: 10, lifetimeDays: 7 },
  order: {
    maxTotal: 20_000,
    maxLines: 10,
    maxQuantity: 20,
    activePerBuyer: 5,
    noteMax: 140,
  },
  ride: { maxFare: 20_000, activePerRider: 1 },
  noteMax: 100,
  messageMax: 1_000,
  stories: { activePerAuthor: 10, textMax: 200, altMax: 420, captionMax: 100 },
  channels: { createdPerUser: 3, nameMax: 50, descriptionMax: 160 },
  ledgerCapacity: 50_000,
} as const;

/**
 * Fields that only the Studio edits (no API writes them), so these limits
 * live here. Lengths are code points, counted like the app counts text.
 */
export const STUDIO_LIMITS = {
  business: {
    descriptionMax: 160,
    addressMax: 100,
    greetingMax: 200,
    /** prepMinutes and deliveryMinutes */
    minutesMax: 240,
  },
  product: {
    nameMax: 60,
    descriptionMax: 140,
    imageAltMax: 120,
    price: { min: 10, max: 20_000 },
  },
} as const;

/** lib/superapp/places.ts: the fixed places for deliveries and rides. */
export const PLACES: readonly { id: string; name: string }[] = [
  { id: "kizilay", name: "Kızılay" },
  { id: "tunali", name: "Tunalı Hilmi" },
  { id: "atakule", name: "Atakule" },
  { id: "anitkabir", name: "Anıtkabir" },
  { id: "odtu", name: "ODTÜ" },
  { id: "esenboga", name: "Esenboğa Airport" },
  { id: "ulus", name: "Ulus" },
  { id: "bahcelievler", name: "Bahçelievler" },
  { id: "kale", name: "Ankara Castle" },
  { id: "genclik", name: "Gençlik Parkı" },
  { id: "asti", name: "AŞTİ" },
];

/** types/Business.ts BusinessCategory */
export const BUSINESS_CATEGORIES: readonly { value: string; title: string }[] =
  [
    { value: "cafe", title: "Café" },
    { value: "restaurant", title: "Restaurant" },
    { value: "healthy", title: "Healthy" },
    { value: "shop", title: "Shop" },
  ];

/** Opening and closing times: "HH:MM", 24-hour, in the business's time zone. */
export const HOURS_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** types/Wallet.ts TransferKind */
export const TRANSFER_KINDS: readonly string[] = [
  "issue",
  "payment",
  "tip",
  "request",
  "order",
  "order_refund",
  "ride",
  "ride_refund",
];

/** types/Wallet.ts TransferContext["type"] */
export const TRANSFER_CONTEXT_TYPES: readonly string[] = [
  "tweet",
  "conversation",
  "request",
  "order",
  "ride",
];

/** types/Wallet.ts PaymentRequestStatus, minus "expired", which is derived on read. */
export const STORED_REQUEST_STATUSES: readonly string[] = [
  "pending",
  "paid",
  "declined",
  "cancelled",
];
