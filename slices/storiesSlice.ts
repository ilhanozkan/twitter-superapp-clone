import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import { ApiRequestError } from "../lib/client/request";
import { storiesApi } from "../lib/client/storiesApi";
import { SEEN_BATCH_MAX } from "../lib/superapp/stories";
import type { AppDispatch, RootState } from "../store";
import { startAppListening } from "./listeners";

/**
 * Where a READ_ONLY demo keeps the stories watched in this tab: the server
 * refuses writes there, so the rings turn grey from this list instead.
 */
export const SEEN_STORAGE_KEY = "stories:seen:v1";
/** Only the most recent ids are kept; older stories have long expired. */
const SEEN_STORAGE_MAX = 500;
/** How often an open viewer reports what was watched (and once more on close). */
export const SEEN_FLUSH_MS = 3_000;

export interface StoriesState {
  /**
   * Stories watched on this device since the page loaded (in READ_ONLY,
   * since the tab opened), so a ring turns grey before the server knows.
   */
  seen: Record<string, true>;
  /** Watched but not reported yet (POST /api/stories/views). */
  pending: string[];
  /** Bumped when the viewer's own stories change, so the tray reloads. */
  trayVersion: number;
  /** sessionStorage has been read into `seen` (READ_ONLY). */
  restored: boolean;
}

const initialState: StoriesState = {
  seen: {},
  pending: [],
  trayVersion: 0,
  restored: false,
};

const storiesSlice = createSlice({
  name: "stories",
  initialState,
  reducers: {
    /**
     * A story was shown in the viewer. One the server already counts as
     * seen (`known`) only greys the ring; any other is also reported.
     */
    storySeen: {
      reducer(state, action: PayloadAction<{ id: string; known: boolean }>) {
        const { id, known } = action.payload;
        if (state.seen[id]) return;
        state.seen[id] = true;
        if (!known) state.pending.push(id);
      },
      prepare(id: string, known = false) {
        return { payload: { id, known } };
      },
    },
    /** These ids are on their way to the server. */
    seenSent(state, action: PayloadAction<string[]>) {
      const sent = new Set(action.payload);
      state.pending = state.pending.filter((id) => !sent.has(id));
    },
    /** Reporting failed for a reason worth another try: send them next time. */
    seenRequeued(state, action: PayloadAction<string[]>) {
      const queued = new Set(state.pending);
      state.pending.push(...action.payload.filter((id) => !queued.has(id)));
    },
    seenRestored(state, action: PayloadAction<string[]>) {
      for (const id of action.payload) state.seen[id] = true;
      state.restored = true;
    },
    /** One of the viewer's own stories was posted or deleted. */
    trayChanged(state) {
      state.trayVersion += 1;
    },
  },
});

export const { storySeen, seenSent, seenRequeued, seenRestored, trayChanged } =
  storiesSlice.actions;

function chunks<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size)
  );
}

/** Lost on the way or refused for now: the same ids can be sent again later. */
const worthRetrying = (error: unknown) =>
  !(error instanceof ApiRequestError) ||
  error.status === 0 ||
  error.status === 429 ||
  error.status >= 500;

/**
 * Reports watched stories in batches of at most 50 ids. An open viewer
 * calls it every 3 s and when it closes, so watching a dozen stories costs
 * a few requests. Marking seen is idempotent on the server, so a batch sent
 * twice (a retry, or one copied into the next page's store) is harmless.
 * A READ_ONLY server refuses writes: there the ids stay on this device.
 */
export function flushSeen() {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState
  ): Promise<void> => {
    const { stories, session } = getState();
    const ids = stories.pending;
    if (ids.length === 0) return;
    dispatch(seenSent(ids));
    if (session.readOnly) return;

    for (const batch of chunks(ids, SEEN_BATCH_MAX)) {
      try {
        await storiesApi.markSeen(batch);
      } catch (error) {
        if (worthRetrying(error)) dispatch(seenRequeued(batch));
      }
    }
  };
}

function readStoredSeen(): string[] {
  try {
    const stored: unknown = JSON.parse(
      window.sessionStorage.getItem(SEEN_STORAGE_KEY) ?? "[]"
    );
    return Array.isArray(stored)
      ? stored.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * READ_ONLY: brings back what this tab watched before a reload. Runs after
 * hydration (the server can't read sessionStorage) and once per page load,
 * since the slice is carried over to each navigation's store.
 */
export function restoreSeen() {
  return (dispatch: AppDispatch, getState: () => RootState) => {
    const { stories, session } = getState();
    if (!session.readOnly || stories.restored) return;
    dispatch(seenRestored(readStoredSeen()));
  };
}

// READ_ONLY keeps watched stories in sessionStorage: the server never learns
// about them, and a reload would otherwise colour every ring again.
startAppListening({
  actionCreator: storySeen,
  effect: (_action, api) => {
    const { stories, session } = api.getState();
    if (!session.readOnly) return;
    try {
      const ids = Object.keys(stories.seen).slice(-SEEN_STORAGE_MAX);
      window.sessionStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // Storage disabled or full: the rings stay grey until a reload.
    }
  },
});

/** Action types that settle in the current page's store after a navigation (see store.ts). */
export const followsNavigation: string[] = [
  seenRequeued.type,
  trayChanged.type,
];

export default storiesSlice.reducer;
