import {
  createAsyncThunk,
  createEntityAdapter,
  createSlice,
  EntityState,
  PayloadAction,
} from "@reduxjs/toolkit";

import { api, errorMessage, NewTweetBody } from "../lib/client/api";
import {
  IReply,
  ITweet,
  ITweetViewerState,
  ReactionKind,
} from "../types/Tweet";

export const tweetsAdapter = createEntityAdapter<ITweet>();

export type TweetsState = EntityState<ITweet, string>;

const VIEWER_FLAG: Record<ReactionKind, keyof ITweetViewerState> = {
  like: "liked",
  retweet: "retweeted",
  bookmark: "bookmarked",
};

const STAT: Partial<Record<ReactionKind, "likes" | "retweets">> = {
  like: "likes",
  retweet: "retweets",
};

export const postTweet = createAsyncThunk(
  "tweets/post",
  async (body: NewTweetBody) => (await api.createTweet(body)).tweet
);

export const deleteTweet = createAsyncThunk<
  { id: string; author: string | null },
  string,
  { state: { tweets: TweetsState } }
>("tweets/delete", async (id, { getState }) => {
  // Read before deleting: profile tweet counts need to know whose it was.
  const author = getState().tweets.entities[id]?.author.username ?? null;
  await api.deleteTweet(id);
  return { id, author };
});

export const postReply = createAsyncThunk(
  "tweets/reply",
  async ({
    tweetId,
    text,
  }: {
    tweetId: string;
    text: string;
  }): Promise<IReply> => (await api.createReply(tweetId, text)).reply
);

/** One reaction on one tweet: whether the viewer has it, and its count. */
export interface ReactionValue {
  active: boolean;
  count?: number;
}

function readReaction(
  tweet: ITweet | undefined,
  kind: ReactionKind
): ReactionValue | undefined {
  if (!tweet) return undefined;
  const stat = STAT[kind];
  return {
    active: tweet.viewer[VIEWER_FLAG[kind]],
    ...(stat ? { count: tweet.stats[stat] } : {}),
  };
}

/** Flips a reaction and adjusts its count, as the server will. */
function applyReaction(tweet: ITweet, kind: ReactionKind, active: boolean) {
  const flag = VIEWER_FLAG[kind];
  if (tweet.viewer[flag] === active) return;

  tweet.viewer[flag] = active;
  const stat = STAT[kind];
  if (stat)
    tweet.stats[stat] = Math.max(0, tweet.stats[stat] + (active ? 1 : -1));
}

function writeReaction(
  tweet: ITweet,
  kind: ReactionKind,
  value: ReactionValue
) {
  tweet.viewer[VIEWER_FLAG[kind]] = value.active;
  const stat = STAT[kind];
  if (stat && value.count !== undefined) tweet.stats[stat] = value.count;
}

type SyncOutcome =
  | { ok: true; value: ReactionValue }
  | { ok: false; value: ReactionValue | undefined; message: string };

interface ToggleSync {
  /** What the latest click asked for. */
  desired: boolean;
  /** The request id of the latest click; only it reports the outcome. */
  latest: string;
  /** The last state the server confirmed (before any click: the store's). */
  confirmed: ReactionValue | undefined;
  run?: Promise<SyncOutcome>;
}

// Requests for one tweet and reaction are sent one at a time. Clicks made
// while one is in flight only update `desired`; when it settles, one more
// request is sent if the server is not where the latest click wants it. So
// the server ends up in the state of the last click, and the UI never shows
// a state the server does not have.
const syncs = new Map<string, ToggleSync>();

async function syncReaction(
  key: string,
  sync: ToggleSync,
  id: string,
  kind: ReactionKind
): Promise<SyncOutcome> {
  for (;;) {
    const want = sync.desired;
    let outcome: SyncOutcome;
    try {
      const { tweet } = await api.setReaction(id, kind, want);
      sync.confirmed = readReaction(tweet, kind);
      if (sync.desired !== want) continue;
      outcome = { ok: true, value: sync.confirmed! };
    } catch (error) {
      outcome = {
        ok: false,
        value: sync.confirmed,
        message: errorMessage(error),
      };
    }
    // Decided: later clicks start a new sync from the settled state.
    syncs.delete(key);
    return outcome;
  }
}

export const setReaction = createAsyncThunk<
  { value: ReactionValue; stale: boolean },
  { id: string; kind: ReactionKind; active: boolean },
  {
    state: { tweets: TweetsState };
    rejectValue: {
      stale: boolean;
      message: string;
      value: ReactionValue | undefined;
    };
  }
>(
  "tweets/setReaction",
  async (
    { id, kind, active },
    { dispatch, getState, requestId, rejectWithValue }
  ) => {
    const key = `${id}:${kind}`;
    let sync = syncs.get(key);
    if (!sync) {
      sync = {
        desired: active,
        latest: requestId,
        confirmed: readReaction(getState().tweets.entities[id], kind),
      };
      syncs.set(key, sync);
      sync.run = syncReaction(key, sync, id, kind);
    }
    sync.desired = active;
    sync.latest = requestId;

    // Optimistic: show the click at once.
    dispatch(reactionToggled({ id, kind, active }));

    const outcome = await sync.run!;
    // Earlier clicks merged into a later one report nothing of their own.
    const stale = sync.latest !== requestId;
    if (outcome.ok) return { value: outcome.value, stale };
    return rejectWithValue({
      stale,
      message: outcome.message,
      value: outcome.value,
    });
  }
);

const tweetsSlice = createSlice({
  name: "tweets",
  initialState: tweetsAdapter.getInitialState(),
  reducers: {
    tweetsReceived: tweetsAdapter.upsertMany,
    reactionToggled(
      state,
      action: PayloadAction<{ id: string; kind: ReactionKind; active: boolean }>
    ) {
      const { id, kind, active } = action.payload;
      const tweet = state.entities[id];
      if (tweet) applyReaction(tweet, kind, active);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(postTweet.fulfilled, (state, action) => {
        tweetsAdapter.addOne(state, action.payload);
      })
      .addCase(deleteTweet.fulfilled, (state, action) => {
        tweetsAdapter.removeOne(state, action.payload.id);
      })
      .addCase(postReply.fulfilled, (state, action) => {
        const tweet = state.entities[action.payload.tweetId];
        if (tweet) tweet.stats.replies += 1;
      })
      // Settle on what the server confirmed: its state after the latest
      // click, or the last confirmed state when that click failed. Only this
      // reaction is touched, so another reaction still in flight keeps its
      // optimistic state.
      .addCase(setReaction.fulfilled, (state, action) => {
        const tweet = state.entities[action.meta.arg.id];
        if (tweet && !action.payload.stale)
          writeReaction(tweet, action.meta.arg.kind, action.payload.value);
      })
      .addCase(setReaction.rejected, (state, action) => {
        const tweet = state.entities[action.meta.arg.id];
        const failure = action.payload;
        if (tweet && failure && !failure.stale && failure.value)
          writeReaction(tweet, action.meta.arg.kind, failure.value);
      });
  },
});

export const { tweetsReceived, reactionToggled } = tweetsSlice.actions;
export default tweetsSlice.reducer;
