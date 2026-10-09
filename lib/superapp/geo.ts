// Distances between catalog places. Streets are not straight lines, so the
// great-circle distance is stretched by a fixed detour factor.

const EARTH_RADIUS_KM = 6371.0088;
const DETOUR_FACTOR = 1.3;

interface Point {
  lat: number;
  lng: number;
}

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in km. */
export function haversineKm(a: Point, b: Point): number {
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) *
      Math.cos(radians(b.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export const round1 = (value: number) => Math.round(value * 10) / 10;

/** Road distance estimate in km, to one decimal. */
export function distanceKm(a: Point, b: Point): number {
  return round1(haversineKm(a, b) * DETOUR_FACTOR);
}
