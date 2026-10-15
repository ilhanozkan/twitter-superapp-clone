import { createSeedData, SeedData } from "../seed";
import { businessSanityDocuments } from "./seeds/business";
import { coreSanityDocuments } from "./seeds/core";
import { SanitySeedDocument } from "./seeds/documents";
import { messagesSanityDocuments } from "./seeds/messages";
import { ordersSanityDocuments } from "./seeds/orders";
import { ridesSanityDocuments } from "./seeds/rides";
import { shopSanityDocuments } from "./seeds/shop";
import { storiesSanityDocuments } from "./seeds/stories";
import { walletSanityDocuments } from "./seeds/wallet";

export type { SanitySeedDocument } from "./seeds/documents";

/**
 * Converts a seed world into Sanity documents with the same shapes the app
 * writes, so it can be imported with `sanity dataset import`. Each feature
 * exports its own documents; private types get "private." ids.
 */
export function seedToSanityDocuments(seed: SeedData): SanitySeedDocument[] {
  return [
    ...coreSanityDocuments(seed),
    ...walletSanityDocuments(seed),
    ...businessSanityDocuments(seed),
    ...shopSanityDocuments(seed),
    ...ordersSanityDocuments(seed),
    ...ridesSanityDocuments(seed),
    ...storiesSanityDocuments(seed),
    ...messagesSanityDocuments(seed),
  ];
}

/**
 * What `npm run seed:sanity` writes: the world the memory store serves
 * (`createSeedData`'s default, the full SuperApp world) at `now`, so a
 * Sanity project starts with the same demo.
 */
export function seedExportDocuments(
  now: Date = new Date()
): SanitySeedDocument[] {
  return seedToSanityDocuments(createSeedData(now));
}
