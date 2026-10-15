import { FeatureId, FeatureStatus, IFeatures } from "../../types/Superapp";
import { featuresFrom, featureStatus } from "../superapp/features";
import { FeatureRepository, Repository } from "./types";

export type SubRepositories = Pick<
  Repository,
  | "wallet"
  | "business"
  | "shop"
  | "orders"
  | "rides"
  | "stories"
  | "messages"
  | "channels"
>;

/** The sub-repository behind each feature. */
export function featureRepositories(
  subs: SubRepositories
): Record<FeatureId, FeatureRepository> {
  return {
    wallet: subs.wallet,
    messages: subs.messages,
    channels: subs.channels,
    shop: subs.shop,
    orders: subs.orders,
    rides: subs.rides,
    stories: subs.stories,
  };
}

/** Feature statuses are fixed for a repository's lifetime, so they are computed once. */
export function resolveFeatures(
  subs: SubRepositories,
  disabled: ReadonlySet<FeatureId>
): { featureStatus(id: FeatureId): FeatureStatus; features: IFeatures } {
  const repositories = featureRepositories(subs);
  const status = (id: FeatureId) =>
    featureStatus(repositories[id], disabled.has(id));
  return { featureStatus: status, features: featuresFrom(status) };
}
