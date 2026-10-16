// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { rideQuotes } from "../../lib/superapp/rides";
import { RideQuoteResponse, RideType } from "../../types/Ride";
import { PlaceId } from "../../types/Superapp";
import { RideRouteChoice, useRideQuote } from "./useRideQuote";

const quote = (from: PlaceId, to: PlaceId, ...busy: RideType[]) =>
  rideQuotes(from, to, (type) => !busy.includes(type));

const initial = {
  route: { from: "kizilay", to: "atakule" } as RideRouteChoice,
  // Comfort drivers are all busy when the page is read.
  quote: quote("kizilay", "atakule", "comfort"),
};

/** fetch answering GET /api/rides/quote when the test says so. */
function deferredQuotes() {
  const pending = new Map<string, (body: RideQuoteResponse) => void>();
  const fetch = vi.fn(
    (path: string) =>
      new Promise<Response>((resolve) => {
        pending.set(path, (body) => resolve(Response.json(body)));
      })
  );
  vi.stubGlobal("fetch", fetch);
  return {
    fetch,
    answer: (path: string, body: RideQuoteResponse) => pending.get(path)!(body),
  };
}

const available = (result: RideQuoteResponse) =>
  result.quotes.map((item) => item.available);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useRideQuote", () => {
  it("starts from the server's quote without asking again", () => {
    const { fetch } = deferredQuotes();
    const { result } = renderHook(() => useRideQuote(initial.route, initial));
    expect(result.current.quotes).toEqual(initial.quote.quotes);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("prices a new route at once, then takes the server's availability", async () => {
    const { fetch, answer } = deferredQuotes();
    const { result, rerender } = renderHook(
      (route: RideRouteChoice) => useRideQuote(route, initial),
      { initialProps: initial.route }
    );

    rerender({ from: "bahcelievler", to: "atakule" });
    // Bahçelievler → Atakule: 7.40 / 10.40 / 13.00, comfort still busy.
    expect(result.current.quotes.map((item) => item.fare)).toEqual([
      740, 1040, 1300,
    ]);
    expect(available(result.current)).toEqual([true, false, true]);
    expect(result.current.distanceKm).toBeCloseTo(6.4, 1);

    const path = "/api/rides/quote?from=bahcelievler&to=atakule";
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(path, expect.anything())
    );
    await act(async () => answer(path, quote("bahcelievler", "atakule", "xl")));
    await waitFor(() =>
      expect(available(result.current)).toEqual([true, true, false])
    );
  });

  it("drops an answer for a route the reader has left", async () => {
    const { fetch, answer } = deferredQuotes();
    const { result, rerender } = renderHook(
      (route: RideRouteChoice) => useRideQuote(route, initial),
      { initialProps: initial.route }
    );

    rerender({ from: "kizilay", to: "esenboga" });
    const left = "/api/rides/quote?from=kizilay&to=esenboga";
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(left, expect.anything())
    );
    rerender({ from: "kizilay", to: "tunali" });

    await act(async () =>
      answer(left, quote("kizilay", "esenboga", "economy"))
    );
    expect(result.current.quotes[0].fare).toBe(
      quote("kizilay", "tunali").quotes[0].fare
    );
    expect(available(result.current)).toEqual([true, false, true]);
  });
});
