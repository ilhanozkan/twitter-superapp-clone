// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getPlace } from "../../lib/superapp/places";
import { MAP_BOX, placeLabel, routeGeometry } from "./mapGeometry";
import SchematicMap from "./SchematicMap";

const kizilay = getPlace("kizilay");
const atakule = getPlace("atakule");

/** matchMedia that answers `reduce` for prefers-reduced-motion. */
function preferReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SchematicMap", () => {
  it("is one image named by the route, captioned as schematic", () => {
    preferReducedMotion(false);
    render(<SchematicMap from={kizilay} to={atakule} distanceKm={5.1} />);

    const map = screen.getByRole("img");
    expect(map.tagName.toLowerCase()).toBe("svg");
    expect(map.getAttribute("aria-label")).toBe(
      "Map from Kızılay to Atakule, 5.1 km"
    );
    expect(screen.getByText("Schematic map, not to scale")).toBeTruthy();
    // Nothing is fetched: every shape is inline.
    expect(map.querySelector("image, use[href]")).toBeNull();
  });

  it("moves the car with a transition, but not under reduced motion", () => {
    preferReducedMotion(false);
    const car = { leg: "trip" as const, fraction: 0.5 };
    render(
      <SchematicMap from={kizilay} to={atakule} distanceKm={5.1} car={car} />
    );
    const moving = screen.getByTestId("map-car");
    expect(moving.style.transform).toMatch(/^translate\(/);
    expect(moving.style.transition).toContain("transform");

    cleanup();
    preferReducedMotion(true);
    render(
      <SchematicMap from={kizilay} to={atakule} distanceKm={5.1} car={car} />
    );
    const still = screen.getByTestId("map-car");
    expect(still.style.transform).toBe(moving.style.transform);
    expect(still.style.transition).toBe("");
  });

  it("draws no car before a driver is assigned", () => {
    preferReducedMotion(false);
    render(
      <SchematicMap
        from={kizilay}
        to={atakule}
        distanceKm={5.1}
        car={null}
        approach
      />
    );
    expect(screen.queryByTestId("map-car")).toBeNull();
  });
});

describe("map geometry", () => {
  const inside = ({ x, y }: { x: number; y: number }) =>
    x >= MAP_BOX.padding - 0.001 &&
    x <= MAP_BOX.width - MAP_BOX.padding + 0.001 &&
    y >= MAP_BOX.padding - 0.001 &&
    y <= MAP_BOX.height - MAP_BOX.padding + 0.001;

  it("auto-fits the route and the driver's approach inside the padding", () => {
    for (const [from, to] of [
      ["kizilay", "atakule"],
      ["bahcelievler", "esenboga"],
      ["kizilay", "tunali"],
      ["odtu", "kale"],
    ] as const) {
      const geometry = routeGeometry(getPlace(from), getPlace(to), {
        approach: true,
      });
      for (const point of [
        geometry.pickup,
        geometry.destination,
        geometry.approach,
      ]) {
        expect(inside(point), `${from} → ${to}`).toBe(true);
      }
    }
  });

  it("keeps north up and east right", () => {
    const geometry = routeGeometry(kizilay, atakule);
    // Atakule is south of Kızılay, so lower on the map.
    expect(geometry.destination.y).toBeGreaterThan(geometry.pickup.y);
    const east = routeGeometry(getPlace("odtu"), getPlace("kale"));
    expect(east.destination.x).toBeGreaterThan(east.pickup.x);
  });

  it("puts a label where it fits, away from the lines that leave its marker", () => {
    // A line leaves upwards: the label goes below.
    expect(
      placeLabel({ x: 200, y: 150 }, [{ x: 200, y: 120 }], 60)
    ).toMatchObject({ anchor: "middle", y: 175 });
    // Near the left edge, a long name is never cut off.
    const edge = placeLabel({ x: 10, y: 150 }, [{ x: 10, y: 180 }], 120);
    expect(edge.anchor).toBe("start");
  });
});
