import { IPlace, PlaceId } from "../../types/Superapp";

// The fixed catalog of places for deliveries and rides: public Ankara
// landmarks with approximate coordinates. There are no map tiles or
// geocoding (the CSP forbids them), so this list is the whole map.

export const PLACES: readonly IPlace[] = [
  {
    id: "kizilay",
    name: "Kızılay",
    area: "Çankaya",
    lat: 39.9208,
    lng: 32.8541,
  },
  {
    id: "tunali",
    name: "Tunalı Hilmi",
    area: "Kavaklıdere",
    lat: 39.9067,
    lng: 32.8607,
  },
  {
    id: "atakule",
    name: "Atakule",
    area: "Çankaya",
    lat: 39.8858,
    lng: 32.8556,
  },
  {
    id: "anitkabir",
    name: "Anıtkabir",
    area: "Anıttepe",
    lat: 39.9251,
    lng: 32.8369,
  },
  { id: "odtu", name: "ODTÜ", area: "Çankaya", lat: 39.8916, lng: 32.7837 },
  {
    id: "esenboga",
    name: "Esenboğa Airport",
    area: "Çubuk",
    lat: 40.1281,
    lng: 32.9951,
  },
  { id: "ulus", name: "Ulus", area: "Altındağ", lat: 39.9419, lng: 32.8543 },
  {
    id: "bahcelievler",
    name: "Bahçelievler",
    area: "Çankaya",
    lat: 39.9227,
    lng: 32.8234,
  },
  {
    id: "kale",
    name: "Ankara Castle",
    area: "Altındağ",
    lat: 39.9409,
    lng: 32.8647,
  },
  {
    id: "genclik",
    name: "Gençlik Parkı",
    area: "Altındağ",
    lat: 39.9367,
    lng: 32.8495,
  },
  { id: "asti", name: "AŞTİ", area: "Söğütözü", lat: 39.9183, lng: 32.8105 },
];

const byId = new Map(PLACES.map((place) => [place.id, place]));

export function isPlaceId(value: unknown): value is PlaceId {
  return typeof value === "string" && byId.has(value as PlaceId);
}

export function getPlace(id: PlaceId): IPlace {
  const place = byId.get(id);
  if (!place) throw new Error(`Unknown place "${id}"`);
  return place;
}
