// Every SuperApp limit in one place, in cents where they are amounts. The
// API validates against them, the repositories enforce them, and Studio
// (sanity/env.ts) mirrors them.

export const LIMITS = {
  /** Also request amounts. */
  payment: { min: 50, max: 20_000 },
  tip: { min: 50, max: 5_000, presets: [100, 200, 500, 1_000] },
  /** cap: the balance after a top-up; perDay: a rolling 24 h, exact. */
  topUp: { amounts: [2_500, 5_000, 10_000], cap: 100_000, perDay: 3 },
  /** Exact. */
  request: { pendingOutgoing: 10, lifetimeDays: 7 },
  order: {
    maxTotal: 20_000,
    maxLines: 10,
    maxQuantity: 20,
    activePerBuyer: 5,
    noteMax: 140,
  },
  ride: { maxFare: 20_000, activePerRider: 1 },
  /** Code points, sanitized like Tweet text. */
  noteMax: 100,
  messageMax: 1_000,
  stories: { activePerAuthor: 10, textMax: 200, altMax: 420, captionMax: 100 },
  channels: { createdPerUser: 3, nameMax: 50, descriptionMax: 160 },
  /** Transfers the memory store keeps; past it, money movement is refused. */
  ledgerCapacity: 50_000,
} as const;
