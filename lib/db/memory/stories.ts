import {
  assertCanPostStory,
  buildTray,
  compareStories,
  isStoryExpired,
  isStoryVisible,
  storyExpiresAt,
} from "../../superapp/stories";
import { StoriesSeed } from "../seeds/stories";
import {
  compareViews,
  copyContent,
  isAuthorOf,
  storyViewKey,
  StoryRecord,
  StoryViewRecord,
  toAuthor,
  toStory,
} from "../stories/records";
import { StoriesRepository } from "../stories/types";
import { MemoryDeps } from "./deps";

export interface StoriesMemoryState {
  /** By id. */
  stories: Map<string, StoryRecord>;
  /** By `storyViewKey`, oldest first (insertion order). */
  views: Map<string, StoryViewRecord>;
}

export function createStoriesMemoryState(
  seed: StoriesSeed | null
): StoriesMemoryState {
  return {
    stories: new Map(
      (seed?.stories ?? []).map((story) => [
        story.id,
        {
          ...story,
          author: toAuthor(story.author),
          content: copyContent(story.content),
        },
      ])
    ),
    views: new Map(
      (seed?.views ?? []).map((view) => [
        storyViewKey(view.storyId, view.viewer.username),
        { ...view, viewer: toAuthor(view.viewer) },
      ])
    ),
  };
}

const lower = (username: string) => username.toLowerCase();

/**
 * Stories in memory. Every method reads and writes synchronously before it
 * returns, so concurrent calls can't interleave (the limit of 10 is exact
 * here). Stories past their cap go expired first, then oldest; views past
 * theirs go oldest first.
 */
export function createMemoryStories(deps: MemoryDeps): StoriesRepository {
  const { now, generateId, limits } = deps;
  const store = () => deps.state.stories;

  const seen = (storyId: string, viewer: string | null) =>
    !!viewer && store().views.has(storyViewKey(storyId, viewer));

  /** How many people other than the author saw each of `records`. */
  const viewCounts = (records: StoryRecord[]) => {
    const counts = new Map<string, number>();
    if (records.length === 0) return counts;
    const authors = new Map(
      records.map((record) => [record.id, lower(record.author.username)])
    );
    for (const view of store().views.values()) {
      const author = authors.get(view.storyId);
      if (author === undefined || lower(view.viewer.username) === author) {
        continue;
      }
      counts.set(view.storyId, (counts.get(view.storyId) ?? 0) + 1);
    }
    return counts;
  };

  /** `records` as `viewer` sees them; views are counted only for the viewer's own. */
  const present = (records: StoryRecord[], viewer: string | null) => {
    const counts = viewCounts(
      records.filter((record) => isAuthorOf(viewer, record))
    );
    return records.map((record) =>
      toStory(record, viewer, {
        seen: seen(record.id, viewer),
        views: counts.get(record.id) ?? 0,
      })
    );
  };

  const visible = (at = now()) =>
    [...store().stories.values()]
      .filter((record) => isStoryVisible(record, at))
      .sort(compareStories);

  const visibleStory = (id: string) => {
    const record = store().stories.get(id);
    return record && isStoryVisible(record, now()) ? record : undefined;
  };

  /** A story goes with its views. */
  const removeStory = (id: string) => {
    if (!store().stories.delete(id)) return false;
    for (const [key, view] of store().views) {
      if (view.storyId === id) store().views.delete(key);
    }
    return true;
  };

  const enforceLimits = (at: Date) => {
    const { stories, views } = store();
    while (stories.size > limits.stories) {
      const all = [...stories.values()];
      const expired = all.filter((record) => isStoryExpired(record, at));
      const victim = (expired.length > 0 ? expired : all).sort(
        compareStories
      )[0];
      removeStory(victim.id);
    }
    for (const key of views.keys()) {
      if (views.size <= limits.storyViews) break;
      views.delete(key);
    }
  };

  return {
    implemented: true,
    configured: true,
    notifications: async () => [],
    liveActivity: async () => [],

    async listTray(viewer) {
      return buildTray(present(visible(), viewer), viewer);
    },

    async getStory(id, viewer) {
      const record = visibleStory(id);
      return record ? present([record], viewer)[0] : null;
    },

    async listStories(author, viewer) {
      return present(
        visible().filter(
          (record) => lower(record.author.username) === lower(author)
        ),
        viewer
      );
    },

    async createStory({ author, content }) {
      const at = now();
      const own = [...store().stories.values()].filter(
        (record) => lower(record.author.username) === lower(author.username)
      );
      assertCanPostStory(
        own.filter((record) => isStoryVisible(record, at)).length
      );

      for (const record of own) {
        if (isStoryExpired(record, at)) removeStory(record.id);
      }
      const record: StoryRecord = {
        id: `story-${generateId()}`,
        author: toAuthor(author),
        content: copyContent(content),
        createdAt: at.toISOString(),
        expiresAt: storyExpiresAt(at),
        blocked: false,
      };
      store().stories.set(record.id, record);
      enforceLimits(at);
      return toStory(record, author.username, { seen: false, views: 0 });
    },

    async deleteStory(id) {
      return removeStory(id);
    },

    async markSeen(storyIds, viewer) {
      const at = now();
      for (const storyId of new Set(storyIds)) {
        const record = store().stories.get(storyId);
        if (!record || !isStoryVisible(record, at)) continue;
        const key = storyViewKey(storyId, viewer.username);
        if (store().views.has(key)) continue;
        store().views.set(key, {
          storyId,
          viewer: toAuthor(viewer),
          createdAt: at.toISOString(),
        });
      }
      enforceLimits(at);
    },

    async listViewers(storyId) {
      const record = visibleStory(storyId);
      if (!record) return [];
      return [...store().views.values()]
        .filter(
          (view) =>
            view.storyId === storyId &&
            lower(view.viewer.username) !== lower(record.author.username)
        )
        .sort(compareViews)
        .map((view) => toAuthor(view.viewer));
    },
  };
}
