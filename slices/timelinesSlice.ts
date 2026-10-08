import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

import { api } from "../lib/client/api";
import { IPage } from "../types/Page";
import { ITweet } from "../types/Tweet";
import { deleteTweet, postTweet, tweetsReceived } from "./tweetsSlice";

/** A list of tweets (home, a profile, search results, bookmarks) and how to load more. */
export interface TimelineState {
  ids: string[];
  /** Query for GET /api/tweets that produced this timeline. */
  query: Record<string, string>;
  nextCursor: string | null;
  status: "idle" | "loading" | "failed";
  error: string | null;
}

export type TimelinesState = Record<string, TimelineState>;

export function timelineFromPage(
  query: Record<string, string>,
  page: IPage<ITweet>
): TimelineState {
  return {
    ids: page.items.map((tweet) => tweet.id),
    query,
    nextCursor: page.nextCursor,
    status: "idle",
    error: null,
  };
}

export const loadMoreTimeline = createAsyncThunk<
  { key: string; ids: string[]; nextCursor: string | null },
  string,
  { state: { timelines: TimelinesState } }
>(
  "timelines/loadMore",
  async (key, { getState, dispatch }) => {
    const timeline = getState().timelines[key];
    const page = await api.listTweets({
      ...timeline.query,
      ...(timeline.nextCursor ? { cursor: timeline.nextCursor } : {}),
    });
    dispatch(tweetsReceived(page.items));
    return {
      key,
      ids: page.items.map((tweet) => tweet.id),
      nextCursor: page.nextCursor,
    };
  },
  {
    condition: (key, { getState }) => {
      const timeline = getState().timelines[key];
      return (
        !!timeline && !!timeline.nextCursor && timeline.status !== "loading"
      );
    },
  }
);

/** Timelines a new tweet by `username` belongs at the top of. */
function acceptsNewTweet(timeline: TimelineState, username: string) {
  const keys = Object.keys(timeline.query);
  if (keys.length === 0) return true;
  return (
    keys.length === 1 &&
    timeline.query.author?.toLowerCase() === username.toLowerCase()
  );
}

const timelinesSlice = createSlice({
  name: "timelines",
  initialState: {} as TimelinesState,
  reducers: {
    timelineLoaded(
      state,
      action: PayloadAction<{ key: string; timeline: TimelineState }>
    ) {
      state[action.payload.key] = action.payload.timeline;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadMoreTimeline.pending, (state, action) => {
        const timeline = state[action.meta.arg];
        timeline.status = "loading";
        timeline.error = null;
      })
      .addCase(loadMoreTimeline.fulfilled, (state, action) => {
        const timeline = state[action.payload.key];
        if (!timeline) return;
        const seen = new Set(timeline.ids);
        timeline.ids.push(...action.payload.ids.filter((id) => !seen.has(id)));
        timeline.nextCursor = action.payload.nextCursor;
        timeline.status = "idle";
      })
      .addCase(loadMoreTimeline.rejected, (state, action) => {
        const timeline = state[action.meta.arg];
        if (!timeline) return;
        timeline.status = "failed";
        timeline.error =
          action.error.message ?? "Something went wrong. Try again.";
      })
      .addCase(postTweet.fulfilled, (state, action) => {
        const tweet = action.payload;
        for (const timeline of Object.values(state)) {
          if (acceptsNewTweet(timeline, tweet.author.username)) {
            timeline.ids.unshift(tweet.id);
          }
        }
      })
      .addCase(deleteTweet.fulfilled, (state, action) => {
        for (const timeline of Object.values(state)) {
          timeline.ids = timeline.ids.filter((id) => id !== action.payload.id);
        }
      });
  },
});

export const { timelineLoaded } = timelinesSlice.actions;
export default timelinesSlice.reducer;
