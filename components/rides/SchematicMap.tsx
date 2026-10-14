import { useMemo } from "react";

import { PLACES } from "../../lib/superapp/places";
import { rideMapLabel } from "../../lib/superapp/rides";
import { IPlace } from "../../types/Superapp";
import {
  carPoint,
  curvePoint,
  MAP_BOX,
  placeLabel,
  Point,
  routeGeometry,
  towards,
} from "./mapGeometry";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

export interface SchematicMapProps {
  from: IPlace;
  to: IPlace;
  distanceKm: number;
  /** Where the car is on its current leg; null hides it (no driver yet, or cancelled). */
  car?: { leg: "pickup" | "trip"; fraction: number } | null;
  /** Leave room for the driver's way to the pickup (ride pages). */
  approach?: boolean;
}

const { width: W, height: H } = MAP_BOX;
const GRID = [50, 100, 150, 200, 250, 300, 350];
// Roughly how wide a 13px label is per character, to keep names inside.
const CHAR_WIDTH = 7.2;

/** A place name beside its marker, clear of the lines that leave it. */
function Label({
  at,
  avoid,
  text,
}: {
  at: Point;
  avoid: Point[];
  text: string;
}) {
  const { x, y, anchor } = placeLabel(at, avoid, text.length * CHAR_WIDTH);
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      className="fill-fg stroke-surface text-[13px] font-bold [paint-order:stroke]"
      strokeWidth={4}
      strokeLinejoin="round"
    >
      {text}
    </text>
  );
}

/**
 * The route on a schematic map: an inline SVG with no network requests.
 * Places are projected from their coordinates and the view auto-fits the
 * route. The car moves along its leg by time; under reduced motion it jumps
 * to each position without a transition.
 */
export default function SchematicMap({
  from,
  to,
  distanceKm,
  car = null,
  approach = false,
}: SchematicMapProps) {
  const reducedMotion = usePrefersReducedMotion();
  const geometry = useMemo(
    () => routeGeometry(from, to, { approach }),
    [from, to, approach]
  );
  const { pickup, destination, control } = geometry;

  const landmarks = PLACES.filter(
    (place) => place.id !== from.id && place.id !== to.id
  )
    .map((place) => geometry.project(place))
    .filter(({ x, y }) => x > 8 && x < W - 8 && y > 8 && y < H - 8);
  const carAt = car ? carPoint(geometry, car) : null;
  // Keep each name off the route, the driver's way in and the other end.
  const leaving = (at: Point, along: Point) =>
    [16, 40].map((distance) => towards(at, along, distance));
  const pickupAvoid = [
    destination,
    ...leaving(pickup, curvePoint(pickup, control, destination, 0.15)),
    ...(approach ? leaving(pickup, geometry.approach) : []),
  ];
  const destinationAvoid = [
    pickup,
    ...leaving(destination, curvePoint(pickup, control, destination, 0.85)),
  ];
  const route = `M ${pickup.x} ${pickup.y} Q ${control.x} ${control.y} ${destination.x} ${destination.y}`;

  return (
    <figure className="overflow-hidden">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={rideMapLabel(from, to, distanceKm)}
        className="block h-auto w-full bg-subtle"
      >
        {GRID.map((at) => (
          <g key={at} className="stroke-line" strokeWidth={1}>
            <line x1={at} y1={0} x2={at} y2={H} />
            {at < H && <line x1={0} y1={at} x2={W} y2={at} />}
          </g>
        ))}
        {landmarks.map((point, index) => (
          <circle
            key={index}
            cx={point.x}
            cy={point.y}
            r={3}
            className="fill-muted"
            opacity={0.45}
          />
        ))}
        {approach && (
          <line
            x1={geometry.approach.x}
            y1={geometry.approach.y}
            x2={pickup.x}
            y2={pickup.y}
            className="stroke-muted"
            strokeWidth={3}
            strokeDasharray="2 7"
            strokeLinecap="round"
          />
        )}
        <path
          d={route}
          fill="none"
          className="stroke-surface"
          strokeWidth={9}
          strokeLinecap="round"
        />
        <path
          d={route}
          fill="none"
          className="stroke-primary"
          strokeWidth={5}
          strokeLinecap="round"
        />
        <circle
          cx={pickup.x}
          cy={pickup.y}
          r={7}
          className="fill-surface stroke-fg"
          strokeWidth={3}
        />
        <rect
          x={destination.x - 7}
          y={destination.y - 7}
          width={14}
          height={14}
          rx={2}
          className="fill-fg stroke-surface"
          strokeWidth={2}
        />
        <Label at={pickup} avoid={pickupAvoid} text={from.name} />
        <Label at={destination} avoid={destinationAvoid} text={to.name} />
        {carAt && (
          <g
            data-testid="map-car"
            style={{
              transform: `translate(${carAt.x}px, ${carAt.y}px)`,
              transition: reducedMotion ? undefined : "transform 1s linear",
            }}
          >
            <circle
              r={12}
              className="fill-primary-fill stroke-surface"
              strokeWidth={3}
            />
            <rect x={-6} y={-2} width={12} height={5} rx={1.5} fill="white" />
            <rect x={-3.5} y={-5} width={7} height={4} rx={1.5} fill="white" />
          </g>
        )}
      </svg>
      <figcaption className="px-4 py-2 text-[13px] text-muted">
        Schematic map, not to scale
      </figcaption>
    </figure>
  );
}
