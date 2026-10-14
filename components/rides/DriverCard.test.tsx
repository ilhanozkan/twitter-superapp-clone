// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { FeatureId } from "../../types/Superapp";
import DriverCard from "./DriverCard";
import { ahmet } from "./testFixtures";

afterEach(() => {
  cleanup();
});

const withFeatures = (...on: FeatureId[]) => ({
  state: {
    session: sessionState({
      viewer: testViewer,
      readOnly: false,
      features: featuresWith(...on),
    }),
  },
});

describe("DriverCard", () => {
  it("shows the driver, the car and its plate, and no ratings", () => {
    const { container } = renderWithStore(
      <DriverCard driver={ahmet} />,
      withFeatures("rides")
    );

    expect(
      screen.getByRole("link", { name: "Ahmet Kaya" }).getAttribute("href")
    ).toBe("/ahmet_drives");
    expect(screen.getByText("White Toyota Corolla")).toBeTruthy();
    expect(screen.getByText("06 AK 1234")).toBeTruthy();
    expect(container.textContent).toContain("Plate 06 AK 1234");
    expect(container.textContent).not.toMatch(/★|☆|rating|stars?\b/i);
  });

  it("offers “Message Ahmet” only while Messages is on", () => {
    renderWithStore(<DriverCard driver={ahmet} />, withFeatures("rides"));
    expect(screen.queryByRole("link", { name: /Message/ })).toBeNull();

    cleanup();
    renderWithStore(
      <DriverCard driver={ahmet} />,
      withFeatures("rides", "messages")
    );
    expect(
      screen.getByRole("link", { name: "Message Ahmet" }).getAttribute("href")
    ).toBe("/messages?to=ahmet_drives");
  });
});
