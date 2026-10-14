import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ridesApi } from "../../lib/client/ridesApi";
import { usePolling } from "../../lib/client/usePolling";
import { rideQuotes } from "../../lib/superapp/rides";
import { RideQuoteResponse } from "../../types/Ride";
import { PlaceId } from "../../types/Superapp";

export interface RideRouteChoice {
  from: PlaceId;
  to: PlaceId;
}

/** How often free drivers are re-checked while the form is open. */
const AVAILABILITY_INTERVAL = 30_000;

const sameRoute = (a: RideRouteChoice, b: RideRouteChoice) =>
  a.from === b.from && a.to === b.to;

/**
 * Quotes for the chosen route. Fares and pickup times are pure (the same
 * functions the server uses), so a new route is priced at once on the
 * client; whether a driver of each type is free comes from the server,
 * which is asked again for every route and every 30 s.
 */
export function useRideQuote(
  route: RideRouteChoice,
  initial: { route: RideRouteChoice; quote: RideQuoteResponse }
): RideQuoteResponse & { refresh: () => Promise<void> } {
  const [server, setServer] = useState(initial);
  const latest = useRef(route);
  const priced = useRef(initial.route);
  useEffect(() => {
    latest.current = route;
    priced.current = server.route;
  });

  const quote = useMemo(() => {
    if (sameRoute(server.route, route)) return server.quote;
    const available = new Map(
      server.quote.quotes.map((item) => [item.type, item.available])
    );
    return rideQuotes(
      route.from,
      route.to,
      (type) => available.get(type) ?? true
    );
  }, [server, route]);

  const { from, to } = route;
  const refresh = useCallback(async () => {
    const response = await ridesApi.quote(from, to);
    // An answer for a route the reader has since left is dropped.
    if (sameRoute(latest.current, { from, to })) {
      setServer({ route: { from, to }, quote: response });
    }
  }, [from, to]);

  // A new route asks the server once (the page arrives with its quote).
  useEffect(() => {
    if (sameRoute(priced.current, { from, to })) return;
    refresh().catch(() => {
      // Keep the locally priced quote; the next poll tries again.
    });
  }, [from, to, refresh]);
  usePolling(refresh, { interval: AVAILABILITY_INTERVAL });

  return { ...quote, refresh };
}
