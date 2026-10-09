import { describe, expect, it } from "vitest";

import { distanceKm, haversineKm, round1 } from "./geo";
import { getPlace, isPlaceId, PLACES } from "./places";

describe("places", () => {
  it("lists the 11 catalog places with unique ids", () => {
    expect(PLACES).toHaveLength(11);
    expect(new Set(PLACES.map((place) => place.id)).size).toBe(11);
    expect(getPlace("kizilay")).toEqual({
      id: "kizilay",
      name: "Kızılay",
      area: "Çankaya",
      lat: 39.9208,
      lng: 32.8541,
    });
  });

  it("recognizes place ids", () => {
    expect(isPlaceId("esenboga")).toBe(true);
    for (const value of ["Kizilay", "paris", "", 1, null]) {
      expect(isPlaceId(value), String(value)).toBe(false);
    }
    expect(() => getPlace("paris" as never)).toThrow(/Unknown place/);
  });
});

describe("distanceKm", () => {
  it("matches the pinned route distances", () => {
    expect(distanceKm(getPlace("bahcelievler"), getPlace("atakule"))).toBe(6.4);
    expect(distanceKm(getPlace("kizilay"), getPlace("atakule"))).toBe(5.1);
    expect(distanceKm(getPlace("kizilay"), getPlace("esenboga"))).toBe(33.8);
  });

  it("is symmetric and zero for the same place", () => {
    const a = getPlace("odtu");
    const b = getPlace("kale");
    expect(distanceKm(a, b)).toBe(distanceKm(b, a));
    expect(haversineKm(a, a)).toBe(0);
  });

  it("rounds to one decimal", () => {
    expect(round1(6.449)).toBe(6.4);
    expect(round1(6.45)).toBe(6.5);
  });
});
