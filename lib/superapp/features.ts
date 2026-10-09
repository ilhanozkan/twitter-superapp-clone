import { FeatureId, FeatureStatus, IFeatures } from "../../types/Superapp";

export const FEATURE_IDS: readonly FeatureId[] = [
  "wallet",
  "messages",
  "channels",
  "shop",
  "orders",
  "rides",
  "stories",
];

export function isFeatureId(value: unknown): value is FeatureId {
  return typeof value === "string" && FEATURE_IDS.includes(value as FeatureId);
}

/**
 * Parses a DISABLED_FEATURES-style list: ids separated by commas or spaces,
 * any case. Unknown names are returned separately so the caller can reject
 * them: a typo must not leave a feature on that someone meant to turn off.
 */
export function parseFeatureList(value: string | undefined): {
  features: Set<FeatureId>;
  unknown: string[];
} {
  const features = new Set<FeatureId>();
  const unknown: string[] = [];

  for (const name of (value ?? "").toLowerCase().split(/[\s,]+/)) {
    if (!name) continue;
    if (isFeatureId(name)) features.add(name);
    else unknown.push(name);
  }
  return { features, unknown };
}

/**
 * "off" when the lane is not built or the feature is disabled;
 * "unconfigured" when it is built but the data source can't serve it (e.g.
 * Sanity without a token); otherwise "on".
 */
export function featureStatus(
  feature: { implemented: boolean; configured: boolean },
  disabled: boolean
): FeatureStatus {
  if (!feature.implemented || disabled) return "off";
  return feature.configured ? "on" : "unconfigured";
}

/** Which features are on, given each feature's status. */
export function featuresFrom(
  statusOf: (id: FeatureId) => FeatureStatus
): IFeatures {
  return Object.fromEntries(
    FEATURE_IDS.map((id) => [id, statusOf(id) === "on"])
  ) as IFeatures;
}
