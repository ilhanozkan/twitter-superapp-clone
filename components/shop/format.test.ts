import { describe, expect, it } from "vitest";

import {
  cardBusinessLine,
  cartText,
  deliveryText,
  etaText,
  feeText,
  shortStatus,
} from "./format";
import { businessPath, menuPath } from "./paths";
import { card, status } from "./testing";

describe("shop wording", () => {
  it("writes estimates, fees and delivery lines", () => {
    expect(etaText([9, 12])).toBe("9–12 min");
    expect(feeText(150)).toBe("1.50 credits fee");
    expect(feeText(0)).toBe("Free delivery");
    expect(
      deliveryText({ etaMinutes: [9, 12], deliveryFee: 150, minimumOrder: 300 })
    ).toBe("Delivery 9–12 min · 1.50 credits fee · Min. 3.00");
    expect(
      deliveryText({ etaMinutes: [12, 15], deliveryFee: 150, minimumOrder: 0 })
    ).toBe("Delivery 12–15 min · 1.50 credits fee");
  });

  it("shortens the status to Open only while orders are taken", () => {
    expect(shortStatus(status.open24)).toBe("Open");
    expect(shortStatus(status.closed)).toBe("Closed · Opens 18:00");
    expect(shortStatus(status.paused)).toBe("Not taking orders right now");
    expect(cardBusinessLine(card())).toBe("Kızılay Kahve · Open · 9–12 min");
  });

  it("counts the cart", () => {
    expect(cartText(1, 250)).toBe("1 item · 2.50 credits");
    expect(cartText(3, 1_450)).toBe("3 items · 14.50 credits");
  });
});

describe("shop paths", () => {
  it("points at a menu, or a product's details on it", () => {
    expect(menuPath("kizilaykahve")).toBe("/kizilaykahve/menu");
    expect(menuPath("kizilaykahve", "seed-p-kk-latte")).toBe(
      "/kizilaykahve/menu?product=seed-p-kk-latte"
    );
  });

  it("keeps the Business page's defaults out of its URL", () => {
    expect(
      businessPath({ business: "superapp", defaultBusiness: "superapp" })
    ).toBe("/business");
    expect(
      businessPath({
        business: "superapp",
        tab: "settings",
        defaultBusiness: "SuperApp",
      })
    ).toBe("/business?tab=settings");
    expect(
      businessPath({
        business: "kizilaykahve",
        tab: "settings",
        defaultBusiness: "superapp",
      })
    ).toBe("/business?business=kizilaykahve&tab=settings");
  });
});
