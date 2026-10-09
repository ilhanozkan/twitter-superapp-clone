import { describe, expect, it } from "vitest";

import {
  FEATURE_IDS,
  featuresFrom,
  featureStatus,
  isFeatureId,
  parseFeatureList,
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

  it("knows every feature id", () => {
    expect(FEATURE_IDS).toHaveLength(7);
    expect(FEATURE_IDS.every(isFeatureId)).toBe(true);
    expect(isFeatureId("live")).toBe(false);
  });
});
