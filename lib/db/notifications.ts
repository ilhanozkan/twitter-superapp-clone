import { DEFAULT_NOTIFICATIONS_LIMIT } from "../constants";
import { FeatureId, IFeatures } from "../../types/Superapp";
import { INotification } from "../../types/Notification";
import { compareNewestFirst } from "./cursor";
import { featureRepositories, SubRepositories } from "./features";

/**
 * One timeline of notifications: the store's core ones (likes, Retweets,
 * replies) merged with every "on" feature's, newest first. Feature
 * notifications are derived on read with stable ids, never stored.
 */
export async function mergeNotifications(
  core: (limit: number) => Promise<INotification[]>,
  subs: SubRepositories,
  features: IFeatures,
  username: string,
  limit = DEFAULT_NOTIFICATIONS_LIMIT
): Promise<INotification[]> {
  const safeLimit = Math.max(0, Math.floor(limit));
  const repositories = featureRepositories(subs);
  const on = (Object.keys(repositories) as FeatureId[]).filter(
    (id) => features[id]
  );

  const lists = await Promise.all([
    core(safeLimit),
    ...on.map((id) => repositories[id].notifications(username, safeLimit)),
  ]);
  return lists.flat().sort(compareNewestFirst).slice(0, safeLimit);
}
