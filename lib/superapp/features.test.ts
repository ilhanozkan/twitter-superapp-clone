import { describe, expect, it } from "vitest";

import { FeatureId, FeatureStatus } from "../../types/Superapp";

import {
  FEATURE_IDS,
  FEATURE_REQUIRES,
  featuresFrom,
  featureStatus,
  isFeatureId,
  parseFeatureList,
  requiredStatus,
} from "./features";

describe("parseFeatureList", () => {
  it("reads ids separated by commas or spaces, in any case", () => {
    expect(parseFeatureList("wallet, Rides  STORIES,,").features).toEqual(
      new Set(["wallet", "rides", "stories"])
    );
    expect(parseFeatureList(undefined)).toEqual({
      features: new Set(),
      unknown: [],
    });
    expect(parseFeatureList("  ").features.size).toBe(0);
  });

  it("returns unknown names separately", () => {
    expect(parseFeatureList("wallet,payments,food")).toEqual({
      features: new Set(["wallet"]),
      unknown: ["payments", "food"],
    });
  });
});

describe("featureStatus", () => {
  it("is off when unbuilt or disabled, unconfigured without the data source", () => {
    const built = { implemented: true, configured: true };
    expect(featureStatus(built, false)).toBe("on");
    expect(featureStatus(built, true)).toBe("off");
    expect(featureStatus({ ...built, implemented: false }, false)).toBe("off");
    expect(featureStatus({ ...built, configured: false }, false)).toBe(
      "unconfigured"
    );
    expect(featureStatus({ ...built, configured: false }, true)).toBe("off");
  });

  it("turns statuses into the features that are on", () => {
    expect(
      featuresFrom((id) =>
        id === "wallet" ? "on" : id === "rides" ? "unconfigured" : "off"
      )
    ).toEqual({
      wallet: true,
      messages: false,
      channels: false,
      shop: false,
      orders: false,
      rides: false,
      stories: false,
    });
  });

  it("is only as available as the features it requires", () => {
    const statuses: Partial<Record<FeatureId, FeatureStatus>> = {
      shop: "off",
      wallet: "unconfigured",
    };
    const own = (id: FeatureId) => statuses[id] ?? "on";

    // Orders sells the shop's products for wallet credits.
    expect(FEATURE_REQUIRES.orders).toEqual(["shop", "wallet"]);
    expect(requiredStatus("orders", own)).toBe("off");
    expect(requiredStatus("rides", own)).toBe("unconfigured");
    expect(requiredStatus("wallet", own)).toBe("unconfigured");
    expect(requiredStatus("stories", own)).toBe("on");
    expect(requiredStatus("rides", () => "on")).toBe("on");
    statuses.rides = "off";
    expect(requiredStatus("rides", own)).toBe("off");
  });

  it("knows every feature id", () => {
    expect(FEATURE_IDS).toHaveLength(7);
    expect(FEATURE_IDS.every(isFeatureId)).toBe(true);
    expect(isFeatureId("live")).toBe(false);
  });
});
