// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { renderWithStore } from "../../test/render";
import RideStatus from "./RideStatus";
import { cancelledFields, rideAfter } from "./testFixtures";

afterEach(() => {
  cleanup();
});

const status = () => screen.getByRole("status");

describe("RideStatus", () => {
  it("heads the page with the stage and lists the stages as steps", () => {
    const { ride, now } = rideAfter(60);
    renderWithStore(<RideStatus ride={ride} now={now} role="rider" />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Ahmet is 2 min away" })
    ).toBeTruthy();
    const steps = screen.getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual([
      expect.stringContaining("Finding your driver"),
      expect.stringContaining("Ahmet is on the way"),
      expect.stringContaining("Picked up"),
      expect.stringContaining("Arrived at Atakule"),
    ]);
    expect(steps[1].getAttribute("aria-current")).toBe("step");
    // Nothing is announced for the stage the page opened with.
    expect(status().textContent).toBe("");
  });

  it("announces a new stage once, never the countdown", () => {
    const first = rideAfter(60);
    const { rerender } = renderWithStore(
      <RideStatus ride={first.ride} now={first.now} role="rider" />
    );

    // The countdown changes; the stage doesn't.
    const later = rideAfter(150);
    rerender(<RideStatus ride={later.ride} now={later.now} role="rider" />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "Ahmet is 1 min away"
    );
    expect(status().textContent).toBe("");

    const picked = rideAfter(200);
    rerender(<RideStatus ride={picked.ride} now={picked.now} role="rider" />);
    expect(status().textContent).toBe("Picked up. On the way to Atakule");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toMatch(
      /^On the way to Atakule · arrives \d\d:\d\d$/
    );

    // Later renders of the same stage leave the announcement as it was.
    const onTrip = rideAfter(400);
    rerender(<RideStatus ride={onTrip.ride} now={onTrip.now} role="rider" />);
    expect(status().textContent).toBe("Picked up. On the way to Atakule");

    const done = rideAfter(700);
    rerender(<RideStatus ride={done.ride} now={done.now} role="rider" />);
    expect(status().textContent).toBe("You’ve arrived at Atakule");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "You’ve arrived"
    );
  });

  it("says a cancelled ride was refunded", () => {
    const { ride, now } = rideAfter(20, cancelledFields(15));
    renderWithStore(<RideStatus ride={ride} now={now} role="rider" />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "Ride cancelled · refunded"
    );
  });

  it("speaks to the driver about the rider", () => {
    const { ride, now } = rideAfter(60);
    renderWithStore(<RideStatus ride={ride} now={now} role="driver" />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "Pick up Ilhan at Kızılay in 2 min"
    );
  });
});
