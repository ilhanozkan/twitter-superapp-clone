// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FEATURE_IDS } from "../../lib/superapp/features";
import Services from "../../pages/services";
import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { IFeatures } from "../../types/Superapp";

// The Services grid (§4.12): a tile per feature that is on, each a link
// holding its h2 (Stories opens the composer instead).

function renderServices(features: IFeatures) {
  return renderWithStore(<Services />, {
    path: "/services",
    state: {
      session: sessionState({ viewer: testViewer, readOnly: false, features }),
      wallet: { wallet: null, limits: null, loaded: true },
    },
  });
}

const tiles = () =>
  within(screen.getByRole("region", { name: "Services" })).getAllByRole(
    "heading",
    { level: 2 }
  );

beforeEach(() => {
  // The business carousel reads the places it shows.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ items: [] }))
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Services", () => {
  it("has a tile for each feature that is on, Orders after Food", () => {
    renderServices(featuresWith(...FEATURE_IDS));
    expect(tiles().map((tile) => tile.textContent)).toEqual([
      "Food",
      "Orders",
      "Rides",
      "Messages",
      "Channels",
      "Wallet",
      "Stories",
    ]);

    const orders = screen.getByRole("link", { name: /^Orders/ });
    expect(orders.getAttribute("href")).toBe("/orders");
    expect(orders.textContent).toBe("OrdersTrack an order or order again");
  });

  it("leaves out Orders while ordering is off", () => {
    renderServices(featuresWith("shop", "wallet"));
    expect(tiles().map((tile) => tile.textContent)).toEqual(["Food", "Wallet"]);
  });
});
