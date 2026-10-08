import {
  createAsyncThunk,
  createEntityAdapter,
  createSlice,
  EntityState,
} from "@reduxjs/toolkit";

import { api, errorMessage } from "../lib/client/api";
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
  async (body: { text: string; image?: string | null }) =>
    (await api.createTweet(body)).tweet
);

export const deleteTweet = createAsyncThunk(
  "tweets/delete",
  async (id: string) => {
    await api.deleteTweet(id);
    return id;
  }
);

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

// Each toggle gets a sequence number. Only the latest request for a tweet and
// reaction decides the outcome, so fast repeated clicks settle on the last one:
// older responses are ignored and older failures do not undo newer clicks.
const latestToggle = new Map<string, number>();
let toggleSequence = 0;

export const setReaction = createAsyncThunk<
  { tweet: ITweet; stale: boolean },
  { id: string; kind: ReactionKind; active: boolean },
  { rejectValue: { stale: boolean; message: string } }
>("tweets/setReaction", async ({ id, kind, active }, { rejectWithValue }) => {
  const key = `${id}:${kind}`;
  const sequence = ++toggleSequence;
  latestToggle.set(key, sequence);

  try {
    const { tweet } = await api.setReaction(id, kind, active);
    return { tweet, stale: latestToggle.get(key) !== sequence };
  } catch (error) {
    return rejectWithValue({
      stale: latestToggle.get(key) !== sequence,
      message: errorMessage(error),
    });
  }
});

function applyReaction(tweet: ITweet, kind: ReactionKind, active: boolean) {
  const flag = VIEWER_FLAG[kind];
  if (tweet.viewer[flag] === active) return;

  tweet.viewer[flag] = active;
  const stat = STAT[kind];
  if (stat)
    tweet.stats[stat] = Math.max(0, tweet.stats[stat] + (active ? 1 : -1));
}

const tweetsSlice = createSlice({
  name: "tweets",
  initialState: tweetsAdapter.getInitialState(),
  reducers: {
    tweetsReceived: tweetsAdapter.upsertMany,
  },
  extraReducers: (builder) => {
    builder
      .addCase(postTweet.fulfilled, (state, action) => {
        tweetsAdapter.addOne(state, action.payload);
      })
      .addCase(deleteTweet.fulfilled, (state, action) => {
        tweetsAdapter.removeOne(state, action.payload);
      })
      .addCase(postReply.fulfilled, (state, action) => {
        const tweet = state.entities[action.payload.tweetId];
        if (tweet) tweet.stats.replies += 1;
      })
      // Optimistic: flip the reaction immediately, undo it if the request fails,
      // and take the server's numbers when it succeeds.
      .addCase(setReaction.pending, (state, action) => {
        const { id, kind, active } = action.meta.arg;
        const tweet = state.entities[id];
        if (tweet) applyReaction(tweet, kind, active);
      })
      .addCase(setReaction.rejected, (state, action) => {
        if (action.payload?.stale) return;
        const { id, kind, active } = action.meta.arg;
        const tweet = state.entities[id];
        if (tweet) applyReaction(tweet, kind, !active);
      })
      .addCase(setReaction.fulfilled, (state, action) => {
        if (!action.payload.stale)
          tweetsAdapter.upsertOne(state, action.payload.tweet);
      });
  },
});

export const { tweetsReceived } = tweetsSlice.actions;
export default tweetsSlice.reducer;
