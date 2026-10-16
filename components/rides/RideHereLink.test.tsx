// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import RideHereLink from "./RideHereLink";

afterEach(() => {
  cleanup();
});

describe("RideHereLink", () => {
  it("opens the booking form with the place as the destination", () => {
    renderWithStore(<RideHereLink placeId="kizilay" />, {
      state: {
        session: sessionState({
          viewer: testViewer,
          readOnly: false,
          features: featuresWith("rides"),
        }),
      },
    });
    expect(
      screen.getByRole("link", { name: "Ride here" }).getAttribute("href")
    ).toBe("/rides?to=kizilay");
  });

  it("is hidden while Rides is off", () => {
    const { container } = renderWithStore(<RideHereLink placeId="kizilay" />);
    expect(container.innerHTML).toBe("");
  });
});
