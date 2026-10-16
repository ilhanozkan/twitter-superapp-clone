import { IStory, IStoryTrayItem, StoryBackground } from "../../types/Story";
import { LimitExceededError } from "../db/errors";
import { LIMITS } from "./limits";

// Stories last 24 hours. Like orders and rides, nothing runs when one runs
// out: whether a story shows is derived from its stored `expiresAt` and the
// server's clock on every read, and the author's next story deletes their
// expired ones. Both stores call these rules, so they can't disagree.

export const STORY_LIMITS = LIMITS.stories;

/** A story's lifetime. Real time: SUPERAPP_TIME_SCALE never shortens it. */
export const STORY_TTL_MS = 24 * 60 * 60 * 1000;

/** The viewer reports seen stories in batches of at most this many ids. */
export const SEEN_BATCH_MAX = 50;

/** The tray lists at most this many accounts (the viewer's own first). */
export const TRAY_MAX_ACCOUNTS = 50;

/**
 * Text-story backgrounds, in the composer's order. White text on each is at
 * least 5:1 (lib/db/stories/rules.test.ts checks it), above the 4.5:1 that
 * WCAG AA asks of normal text.
 */
export const STORY_BACKGROUNDS: readonly {
  id: StoryBackground;
  label: string;
  color: string;
}[] = [
  { id: "blue", label: "Blue", color: "#1570c2" },
  { id: "purple", label: "Purple", color: "#6d28d9" },
  { id: "green", label: "Green", color: "#047857" },
  { id: "orange", label: "Orange", color: "#b45309" },
  { id: "pink", label: "Pink", color: "#be185d" },
  { id: "slate", label: "Slate", color: "#334155" },
];

export const STORY_BACKGROUND_IDS = STORY_BACKGROUNDS.map(
  (background) => background.id
) as [StoryBackground, ...StoryBackground[]];

export function isStoryBackground(value: unknown): value is StoryBackground {
  return STORY_BACKGROUND_IDS.includes(value as StoryBackground);
}

export function storyBackgroundColor(id: StoryBackground): string {
  return STORY_BACKGROUNDS.find((background) => background.id === id)!.color;
}

/** Exactly 24 hours after `createdAt`. */
export function storyExpiresAt(createdAt: Date): string {
  return new Date(createdAt.getTime() + STORY_TTL_MS).toISOString();
}

/** From `expiresAt` on, a story is gone (not one millisecond later). */
export function isStoryExpired(
  story: { expiresAt: string },
  now: Date
): boolean {
  return Date.parse(story.expiresAt) <= now.getTime();
}

/** Shown until it expires, unless a moderator blocked it. */
export function isStoryVisible(
  story: { expiresAt: string; blocked: boolean },
  now: Date
): boolean {
  return !story.blocked && !isStoryExpired(story, now);
}

/** Throws unless the author has room for one more story; `active` counts their visible ones. */
export function assertCanPostStory(active: number): void {
  if (active >= STORY_LIMITS.activePerAuthor) {
    throw new LimitExceededError(
      `You can have at most ${STORY_LIMITS.activePerAuthor} active stories. Delete one or wait until one disappears.`
    );
  }
}

const lower = (username: string) => username.toLowerCase();

/** Code-point order, like GROQ's `order()`, so both stores sort alike. */
export const compareKeys = (a: string, b: string) =>
  a < b ? -1 : a > b ? 1 : 0;

/** Oldest first, the order a viewer plays them in; ties by id. */
export function compareStories(
  a: { createdAt: string; id: string },
  b: { createdAt: string; id: string }
): number {
  return (
    Date.parse(a.createdAt) - Date.parse(b.createdAt) || compareKeys(a.id, b.id)
  );
}

/**
 * Groups visible stories by author for the tray on Home: the viewer's own
 * ("Your story") first, then accounts with stories the viewer hasn't seen,
 * then the rest; within each, the most recent poster first. Each item lists
 * its stories oldest first, which of them the viewer hasn't seen, and where
 * to start playing (the first unseen).
 */
export function buildTray(
  stories: IStory[],
  viewer: string | null
): IStoryTrayItem[] {
  const byAuthor = new Map<string, IStory[]>();
  for (const story of [...stories].sort(compareStories)) {
    const key = lower(story.author.username);
    byAuthor.set(key, [...(byAuthor.get(key) ?? []), story]);
  }

  const items = [...byAuthor.values()].map((own): IStoryTrayItem => {
    const latest = own[own.length - 1];
    const unseenIds = own
      .filter((story) => !story.viewer.seen)
      .map((story) => story.id);
    return {
      author: { ...latest.author },
      storyIds: own.map((story) => story.id),
      latestAt: latest.createdAt,
      hasUnseen: unseenIds.length > 0,
      firstUnseenId: unseenIds[0] ?? null,
      unseenIds,
    };
  });

  const group = (item: IStoryTrayItem) =>
    viewer && lower(item.author.username) === lower(viewer)
      ? 0
      : item.hasUnseen
        ? 1
        : 2;

  return items
    .sort(
      (a, b) =>
        group(a) - group(b) ||
        Date.parse(b.latestAt) - Date.parse(a.latestAt) ||
        compareKeys(lower(a.author.username), lower(b.author.username))
    )
    .slice(0, TRAY_MAX_ACCOUNTS);
}
