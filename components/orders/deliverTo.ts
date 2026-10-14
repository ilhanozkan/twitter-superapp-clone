import { useState } from "react";

import { isPlaceId } from "../../lib/superapp/places";
import { PlaceId } from "../../types/Superapp";

// "Deliver to" remembers the last place used on this device (§4.8), in
// localStorage "deliverTo:v1", guarded: storage can be full, blocked or
// absent, and then Kızılay it is.

export const DELIVER_TO_KEY = "deliverTo:v1";
export const DEFAULT_DELIVER_TO: PlaceId = "kizilay";

export function readDeliverTo(): PlaceId {
  try {
    const stored = window.localStorage.getItem(DELIVER_TO_KEY);
    return isPlaceId(stored) ? stored : DEFAULT_DELIVER_TO;
  } catch {
    return DEFAULT_DELIVER_TO;
  }
}

/** Remembered once an order to it is placed. */
export function writeDeliverTo(place: PlaceId) {
  try {
    window.localStorage.setItem(DELIVER_TO_KEY, place);
  } catch {
    // Not remembered on this device; the next order starts at Kızılay.
  }
}

/**
 * The place to deliver to, starting at the last one used. For forms that
 * only render in the browser (the sheet, checkout once the cart is read),
 * so reading storage while rendering can't differ from the server's HTML.
 */
export function useDeliverTo() {
  return useState<PlaceId>(() =>
    typeof window === "undefined" ? DEFAULT_DELIVER_TO : readDeliverTo()
  );
}
