import {
  assertCanPostStory,
  buildTray,
  isStoryBackground,
  storyExpiresAt,
} from "../../superapp/stories";
import { StoryContent } from "../../../types/Story";
import { IAuthor } from "../../../types/User";
import {
  copyContent,
  storyViewKey,
  StoryRecord,
  StoryViewRecord,
  toAuthor,
  toStory,
} from "../stories/records";
import { StoriesRepository } from "../stories/types";
import { SanityDeps } from "./deps";
import { KEY_PATTERN, privateId } from "./ids";
import { SanityMutation } from "./ledger";
import { compact } from "./seeds/documents";
import {
  AUTHOR_STORIES_QUERY,
  CREATE_STORY_QUERY,
  DELETE_STORY_QUERY,
  MARK_SEEN_QUERY,
  STORY_QUERY,
  VIEWERS_QUERY,
  VISIBLE_STORIES_QUERY,
} from "./storiesQueries";

// Stories are public documents (a story's id is its document id), so they
// stay readable without a token; writes need one. Views are private
// ("private.storyview-<story>-<viewer>"), so without a token nobody has seen
// anything. The app and the seed export share the converters below.

const lower = (username: string) => username.toLowerCase();

const party = (author: IAuthor) =>
  compact({
    username: author.username,
    fullname: author.fullname,
    image: author.image,
  });

export function storyDocument(record: StoryRecord) {
  const { content } = record;
  return compact({
    _id: record.id,
    _type: "story",
    author: party(record.author),
    authorKey: lower(record.author.username),
    contentType: content.type,
    text: content.type === "text" ? content.text : null,
    background: content.type === "text" ? content.background : null,
    image: content.type === "image" ? content.image : null,
    imageAlt: content.type === "image" ? content.alt : null,
    caption: content.type === "image" ? content.caption : null,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    blocked: record.blocked,
  });
}

/** A weak reference: deleting a story never waits for its views. */
export function storyViewDocument(view: StoryViewRecord) {
  return compact({
    _id: privateId(storyViewKey(view.storyId, view.viewer.username)),
    _type: "storyView",
    story: { _type: "reference", _ref: view.storyId, _weak: true },
    storyId: view.storyId,
    username: view.viewer.username,
    fullname: view.viewer.fullname,
    image: view.viewer.image,
    userKey: lower(view.viewer.username),
    createdAt: view.createdAt,
  });
}

interface StoryRow {
  id: string;
  author: IAuthor;
  contentType: string | null;
  text: string | null;
  background: string | null;
  image: string | null;
  imageAlt: string | null;
  caption: string | null;
  createdAt: string;
  expiresAt: string;
  blocked: boolean;
  seen: boolean;
  views: number | null;
}

function contentFromRow(row: StoryRow): StoryContent | null {
  if (
    row.contentType === "text" &&
    typeof row.text === "string" &&
    isStoryBackground(row.background)
  ) {
    return { type: "text", text: row.text, background: row.background };
  }
  if (
    row.contentType === "image" &&
    typeof row.image === "string" &&
    typeof row.imageAlt === "string"
  ) {
    return {
      type: "image",
      image: row.image,
      alt: row.imageAlt,
      caption: row.caption ?? null,
    };
  }
  return null;
}

/** Only the app writes stories, but a document missing its content is skipped rather than shown broken. */
function storyFromRow(row: StoryRow): StoryRecord | null {
  const content = contentFromRow(row);
  if (!content || !row.author?.username) return null;
  return {
    id: row.id,
    author: { ...row.author, image: row.author.image ?? null },
    content,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    blocked: row.blocked,
  };
}

export function createSanityStories(deps: SanityDeps): StoriesRepository {
  const { read, now } = deps;

  const mutate = (mutations: SanityMutation[]) =>
    deps.client.mutate(mutations, { visibility: "sync" });

  const readParams = (viewer: string | null) => ({
    now: now().toISOString(),
    viewer: viewer ? lower(viewer) : "",
  });

  const present = (rows: StoryRow[] | null, viewer: string | null) =>
    (rows ?? []).flatMap((row) => {
      const record = storyFromRow(row);
      return record
        ? [toStory(record, viewer, { seen: row.seen, views: row.views })]
        : [];
    });

  return {
    implemented: true,
    // Public documents: readable with or without a token.
    configured: true,
    notifications: async () => [],
    liveActivity: async () => [],

    async listTray(viewer) {
      const rows = await read<StoryRow[]>(
        VISIBLE_STORIES_QUERY,
        readParams(viewer)
      );
      return buildTray(present(rows, viewer), viewer);
    },

    async getStory(id, viewer) {
      if (!KEY_PATTERN.test(id)) return null;
      const row = await read<StoryRow | null>(STORY_QUERY, {
        ...readParams(viewer),
        id,
      });
      return present(row ? [row] : [], viewer)[0] ?? null;
    },

    async listStories(author, viewer) {
      const rows = await read<StoryRow[]>(AUTHOR_STORIES_QUERY, {
        ...readParams(viewer),
        author: lower(author),
      });
      return present(rows, viewer);
    },

    // The limit is read-checked: two stories posted at the same instant can
    // both pass it (the per-user budget of 10 an hour bounds the overshoot).
    async createStory({ author, content }) {
      deps.assertWritable();
      const at = now();
      const snapshot = await read<{
        active: number;
        expired: { id: string; views: string[] }[];
      }>(CREATE_STORY_QUERY, {
        key: lower(author.username),
        now: at.toISOString(),
      });
      assertCanPostStory(snapshot?.active ?? 0);

      const record: StoryRecord = {
        id: `story-${deps.generateId()}`,
        author: toAuthor(author),
        content: copyContent(content),
        createdAt: at.toISOString(),
        expiresAt: storyExpiresAt(at),
        blocked: false,
      };
      await mutate([
        { create: storyDocument(record) },
        ...(snapshot?.expired ?? [])
          .flatMap((expired) => [expired.id, ...(expired.views ?? [])])
          .map((id) => ({ delete: { id } })),
      ]);
      return toStory(record, author.username, { seen: false, views: 0 });
    },

    async deleteStory(id) {
      deps.assertWritable();
      if (!KEY_PATTERN.test(id)) return false;
      const found = await read<{ id: string | null; views: string[] }>(
        DELETE_STORY_QUERY,
        { id }
      );
      if (!found?.id) return false;
      await mutate(
        [found.id, ...(found.views ?? [])].map((documentId) => ({
          delete: { id: documentId },
        }))
      );
      return true;
    },

    // One transaction for the batch. createIfNotExists keeps it idempotent
    // when the same viewer reports the same story twice at once.
    async markSeen(storyIds, viewer) {
      deps.assertWritable();
      const ids = [...new Set(storyIds)].filter((id) => KEY_PATTERN.test(id));
      if (ids.length === 0) return;

      const at = now();
      const found = await read<{ visible: string[]; seen: string[] }>(
        MARK_SEEN_QUERY,
        { ids, now: at.toISOString(), viewer: lower(viewer.username) }
      );
      const seen = new Set(found?.seen ?? []);
      const unseen = (found?.visible ?? []).filter((id) => !seen.has(id));
      if (unseen.length === 0) return;

      await mutate(
        unseen.map((storyId) => ({
          createIfNotExists: storyViewDocument({
            storyId,
            viewer: toAuthor(viewer),
            createdAt: at.toISOString(),
          }),
        }))
      );
    },

    async listViewers(storyId) {
      if (!KEY_PATTERN.test(storyId)) return [];
      const row = await read<{ viewers: IAuthor[] } | null>(VIEWERS_QUERY, {
        id: storyId,
        now: now().toISOString(),
      });
      return (row?.viewers ?? []).map((viewer) =>
        toAuthor({ ...viewer, image: viewer.image ?? null })
      );
    },
  };
}
