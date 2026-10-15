import { FEATURE_IDS } from "../superapp/features";
import { ActivityResponse } from "../../types/Api";
import { FeatureId, ILiveActivity } from "../../types/Superapp";
import type { Repository } from "../db";

/** Badges show "99+" past this. */
export const MAX_NEW_NOTIFICATIONS = 99;

/** Lane reads must not take the shell down: a failing one counts as nothing. */
async function settled<T>(
  feature: FeatureId,
  read: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: `Reading ${feature} activity failed`,
        error:
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error),
      })
    );
    return fallback;
  }
}

/**
 * What the shell polls for (GET /api/activity, and the first render):
 * unread conversations, notifications newer than `since` (all of them when
 * it is null, up to 99) and every "on" feature's things in progress, in
 * feature order. Nothing here writes: reading never marks anything seen.
 */
export async function loadActivity(
  repo: Repository,
  viewer: string,
  { since = null, now = new Date() }: { since?: string | null; now?: Date } = {}
): Promise<ActivityResponse> {
  const on = FEATURE_IDS.filter((id) => repo.features[id]);
  const sinceMs = since ? Date.parse(since) : null;

  const [unreadConversations, notifications, ...live] = await Promise.all([
    repo.features.messages
      ? settled("messages", () => repo.messages.unreadConversations(viewer), 0)
      : 0,
    repo.listNotifications(viewer, MAX_NEW_NOTIFICATIONS),
    ...on.map((id) =>
      settled(id, () => repo[id].liveActivity(viewer), [] as ILiveActivity[])
    ),
  ]);

  return {
    serverNow: now.toISOString(),
    unreadConversations,
    newNotifications: notifications.filter(
      (notification) =>
        sinceMs === null || Date.parse(notification.createdAt) > sinceMs
    ).length,
    live: live.flat(),
  };
}
