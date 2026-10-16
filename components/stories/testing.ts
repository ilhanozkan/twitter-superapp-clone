import { vi } from "vitest";

import { IStory, IStoryTrayItem, StoryContent } from "../../types/Story";
import { IAuthor } from "../../types/User";

// Fixtures and a fake API for the stories component tests.

export const mert: IAuthor = {
  username: "foodie_ankara",
  fullname: "Mert Demir",
  image: null,
};
export const lena: IAuthor = {
  username: "lenaframes",
  fullname: "Lena Hoffmann",
  image: null,
};
export const me: IAuthor = {
  username: "illlhanozkan",
  fullname: "Ilhan Ozkan",
  image: null,
};

const HOUR = 60 * 60 * 1000;

export const text = (value: string): StoryContent => ({
  type: "text",
  text: value,
  background: "blue",
});

/** A story posted `hoursAgo` (plus half a minute, so "2 hours ago" holds). */
export function story(
  id: string,
  author: IAuthor,
  content: StoryContent,
  { hoursAgo = 2, seen = false, views = null as number | null } = {}
): IStory {
  const createdAt = new Date(Date.now() - hoursAgo * HOUR - 30_000);
  return {
    id,
    author,
    content,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + 24 * HOUR).toISOString(),
    viewer: { seen },
    views,
  };
}

export function trayItem(author: IAuthor, stories: IStory[]): IStoryTrayItem {
  const unseenIds = stories
    .filter((item) => !item.viewer.seen)
    .map((item) => item.id);
  return {
    author,
    storyIds: stories.map((item) => item.id),
    latestAt: stories[stories.length - 1].createdAt,
    hasUnseen: unseenIds.length > 0,
    firstUnseenId: unseenIds[0] ?? null,
    unseenIds,
  };
}

export interface Call {
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string>;
}

/**
 * Answers the stories (and messages) endpoints from `stories`, keyed by
 * author, and records every request. `viewsError` makes
 * POST /api/stories/views answer that error; `listDelay` holds each
 * account's stories back that many ms (fake timers move it on).
 */
export function stubStoriesApi(
  byAuthor: Record<string, IStory[]>,
  {
    viewers = [] as IAuthor[],
    tray = [] as IStoryTrayItem[],
    failViews = false,
    viewsError = null as { status: number; code: string } | null,
    listDelay = 0,
  } = {}
) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (path: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({
      method,
      path,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      headers: (init.headers ?? {}) as Record<string, string>,
    });
    const url = new URL(path, "http://localhost");

    if (url.pathname === "/api/stories" && method === "GET") {
      const author = url.searchParams.get("author") ?? "";
      if (listDelay)
        await new Promise((resolve) => setTimeout(resolve, listDelay));
      return Response.json({ items: byAuthor[author] ?? [] });
    }
    if (url.pathname === "/api/stories/tray") {
      return Response.json({ items: tray });
    }
    if (url.pathname === "/api/stories/views") {
      if (failViews) throw new TypeError("Failed to fetch");
      if (viewsError) {
        return Response.json(
          { error: { code: viewsError.code, message: "Refused" } },
          { status: viewsError.status }
        );
      }
      return new Response(null, { status: 204 });
    }
    if (url.pathname.endsWith("/viewers")) {
      return Response.json({ items: viewers });
    }
    if (url.pathname.startsWith("/api/stories/") && method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/api/conversations") {
      return Response.json({ conversation: { id: "conv-1" } }, { status: 201 });
    }
    if (url.pathname === "/api/conversations/conv-1/messages") {
      return Response.json({ message: { id: "msg-1" } }, { status: 201 });
    }
    return Response.json(
      { error: { code: "not_found", message: "Not found" } },
      { status: 404 }
    );
  });
  vi.stubGlobal("fetch", fetch);
  return { fetch, calls };
}

/** jsdom has no PointerEvent: React's pointer handlers need `pointerType`. */
export function installPointerEvent() {
  if ("PointerEvent" in window) return;
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? "";
    }
  }
  Object.defineProperty(window, "PointerEvent", {
    value: PointerEventPolyfill,
    configurable: true,
    writable: true,
  });
}

/** window.matchMedia answering `matches` for prefers-reduced-motion. */
export function stubReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion") && matches,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

export function unstubMatchMedia() {
  Reflect.deleteProperty(window, "matchMedia");
}
