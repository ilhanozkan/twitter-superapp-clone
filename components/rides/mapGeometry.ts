import { IPlace } from "../../types/Superapp";

// The schematic map's geometry. There are no tiles or geocoding (the CSP
// forbids them): places are projected from their coordinates onto a flat
// plane around the route, and the view is fitted to what it must show.

export interface Point {
  x: number;
  y: number;
}

/** The map's viewBox (4:3) and the margin kept around the fitted points. */
export const MAP_BOX = { width: 400, height: 300, padding: 56 };

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * A flat projection around `origin`: east is +x and north is −y, with
 * longitude shrunk by cos(latitude) so the city keeps its shape. Units are
 * arbitrary; `fitView` scales them.
 */
export function flatProjection(origin: { lat: number; lng: number }) {
  const shrink = Math.cos(radians(origin.lat));
  return (place: { lat: number; lng: number }): Point => ({
    x: (place.lng - origin.lng) * shrink,
    y: origin.lat - place.lat,
  });
}

/**
 * Scales and centres `points` into the box with `padding` on every side,
 * keeping the aspect ratio. Returns the mapping for any other point.
 */
export function fitView(
  points: Point[],
  { width, height, padding } = MAP_BOX
): (point: Point) => Point {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  const room = { x: width - 2 * padding, y: height - 2 * padding };
  const scale = Math.min(
    spanX > 0 ? room.x / spanX : Infinity,
    spanY > 0 ? room.y / spanY : Infinity
  );
  const factor = Number.isFinite(scale) ? scale : 1;
  const offset = {
    x: (width - spanX * factor) / 2,
    y: (height - spanY * factor) / 2,
  };
  return (point) => ({
    x: offset.x + (point.x - minX) * factor,
    y: offset.y + (point.y - minY) * factor,
  });
}

/** The point at `t` (0..1) on the quadratic curve from `a` to `b` bent towards `control`. */
export function curvePoint(a: Point, control: Point, b: Point, t: number) {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * control.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * control.y + t * t * b.y,
  };
}

export const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export interface RouteGeometry {
  pickup: Point;
  destination: Point;
  /** Bends the route so it reads as a road, not a ruler line. */
  control: Point;
  /** Where the driver sets off for the pickup. */
  approach: Point;
  /** Projects any other place into the same view. */
  project: (place: IPlace) => Point;
}

/**
 * The route from `from` to `to` in viewBox units, fitted with padding.
 * With `approach`, the view also makes room for the driver's way to the
 * pickup, so it doesn't jump when the car reaches the pickup.
 */
export function routeGeometry(
  from: IPlace,
  to: IPlace,
  { approach = false }: { approach?: boolean } = {}
): RouteGeometry {
  const flat = flatProjection({
    lat: (from.lat + to.lat) / 2,
    lng: (from.lng + to.lng) / 2,
  });
  const a = flat(from);
  const b = flat(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  // Bend to the left of the direction of travel by a fifth of the length.
  const control = {
    x: (a.x + b.x) / 2 + dy * 0.2,
    y: (a.y + b.y) / 2 - dx * 0.2,
  };
  // The driver comes from behind the pickup, off the route's axis.
  const angle = Math.atan2(-dy, -dx) + radians(50);
  const start = {
    x: a.x + Math.cos(angle) * length * 0.45,
    y: a.y + Math.sin(angle) * length * 0.45,
  };

  const fitted = [a, b, curvePoint(a, control, b, 0.5)];
  if (approach) fitted.push(start);
  const view = fitView(fitted);
  return {
    pickup: view(a),
    destination: view(b),
    control: view(control),
    approach: view(start),
    project: (place) => view(flat(place)),
  };
}

/** Where the car is drawn: on its way to the pickup, or along the route. */
export function carPoint(
  geometry: RouteGeometry,
  car: { leg: "pickup" | "trip"; fraction: number }
): Point {
  const t = Math.min(1, Math.max(0, car.fraction));
  return car.leg === "pickup"
    ? lerp(geometry.approach, geometry.pickup, t)
    : curvePoint(geometry.pickup, geometry.control, geometry.destination, t);
}

export interface LabelPlacement {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
}

/** Distance from a point to the nearest edge or inside of a rectangle. */
function distanceToBox(
  point: Point,
  box: { left: number; top: number; right: number; bottom: number }
) {
  const dx = Math.max(box.left - point.x, 0, point.x - box.right);
  const dy = Math.max(box.top - point.y, 0, point.y - box.bottom);
  return Math.hypot(dx, dy);
}

/**
 * Where to write a marker's name: above, below, left or right of it,
 * whichever fits inside the view and keeps farthest from `avoid` (points
 * on the lines leaving the marker, other markers). `width` is the text's
 * approximate width and `size` its font size, in viewBox units.
 */
export function placeLabel(
  at: Point,
  avoid: Point[],
  width: number,
  { size = 13, box = MAP_BOX }: { size?: number; box?: typeof MAP_BOX } = {}
): LabelPlacement {
  const gap = 12;
  const candidates: (LabelPlacement & { left: number; top: number })[] = [
    {
      x: at.x,
      y: at.y - gap,
      anchor: "middle",
      left: at.x - width / 2,
      top: at.y - gap - size,
    },
    {
      x: at.x,
      y: at.y + gap + size,
      anchor: "middle",
      left: at.x - width / 2,
      top: at.y + gap,
    },
    {
      x: at.x - gap,
      y: at.y + size / 3,
      anchor: "end",
      left: at.x - gap - width,
      top: at.y - size / 2,
    },
    {
      x: at.x + gap,
      y: at.y + size / 3,
      anchor: "start",
      left: at.x + gap,
      top: at.y - size / 2,
    },
  ];
  const scored = candidates.map(({ left, top, ...placement }) => {
    const rect = { left, top, right: left + width, bottom: top + size };
    const inside =
      rect.left >= 2 &&
      rect.top >= 2 &&
      rect.right <= box.width - 2 &&
      rect.bottom <= box.height - 2;
    const clearance = Math.min(
      Infinity,
      ...avoid.map((point) => distanceToBox(point, rect))
    );
    return { placement, inside, clearance };
  });
  const best = [...scored].sort(
    (a, b) => Number(b.inside) - Number(a.inside) || b.clearance - a.clearance
  )[0];
  return best.placement;
}

/** A point `distance` units from `from` towards `to`. */
export function towards(from: Point, to: Point, distance: number): Point {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length === 0) return from;
  const t = Math.min(1, distance / length);
  return lerp(from, to, t);
}
