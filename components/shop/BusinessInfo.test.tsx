// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { IFeatures } from "../../types/Superapp";
import BusinessInfo from "./BusinessInfo";
import BusinessStatus from "./BusinessStatus";
import OrderButton from "./OrderButton";
import { business, status } from "./testing";

const session = (features: IFeatures) => ({
  session: sessionState({ viewer: testViewer, readOnly: false, features }),
});

afterEach(() => {
  cleanup();
});

describe("BusinessInfo", () => {
  it("shows the open state, delivery and address as text", () => {
    renderWithStore(<BusinessInfo business={business()} />, {
      state: session(featuresWith("shop")),
    });
    expect(screen.getByText("Open 24 hours")).toBeTruthy();
    expect(
      screen.getByText("Delivery 9–12 min · 1.50 credits fee · Min. 3.00")
    ).toBeTruthy();
    expect(screen.getByText("Kızılay Square, Çankaya, Ankara")).toBeTruthy();
  });

  it("drops what doesn't apply", () => {
    renderWithStore(
      <BusinessInfo
        business={business({
          deliveryFee: 0,
          minimumOrder: 0,
          status: status.paused,
        })}
      />,
      { state: session(featuresWith("shop")) }
    );
    expect(screen.getByText("Not taking orders right now")).toBeTruthy();
    expect(screen.getByText("Delivery 9–12 min · Free delivery")).toBeTruthy();
  });

  it("shows nothing while the shop is off", () => {
    const { container } = renderWithStore(
      <BusinessInfo business={business()} />,
      { state: session(featuresWith()) }
    );
    expect(container.innerHTML).toBe("");
  });
});

describe("BusinessStatus", () => {
  it("says it in words, with a decorative icon", () => {
    const { container } = renderWithStore(
      <BusinessStatus status={status.closed} />
    );
    expect(container.textContent).toBe("Closed · Opens 18:00");
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true"
    );
  });
});

describe("OrderButton", () => {
  it("leads to the Menu tab while the shop is on", () => {
    renderWithStore(<OrderButton business={business()} />, {
      state: session(featuresWith("shop")),
    });
    expect(
      screen.getByRole("link", { name: "Order" }).getAttribute("href")
    ).toBe("/kizilaykahve/menu");
  });

  it("is hidden while the shop is off", () => {
    renderWithStore(<OrderButton business={business()} />, {
      state: session(featuresWith()),
    });
    expect(screen.queryByRole("link")).toBeNull();
  });
});
