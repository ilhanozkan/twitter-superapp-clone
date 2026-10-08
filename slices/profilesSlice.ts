import { createSlice } from "@reduxjs/toolkit";

import { IUserProfile } from "../types/User";
import { deleteTweet, postTweet } from "./tweetsSlice";

/**
 * Tweet counts of the profiles loaded on the server, by lowercase username,
 * kept current as the viewer posts and deletes.
 */
export interface ProfilesState {
  tweetCounts: Record<string, number>;
}

const initialState: ProfilesState = { tweetCounts: {} };

const profilesSlice = createSlice({
  name: "profiles",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(postTweet.fulfilled, (state, action) => {
        const key = action.payload.author.username.toLowerCase();
        if (key in state.tweetCounts) state.tweetCounts[key] += 1;
      })
      .addCase(deleteTweet.fulfilled, (state, action) => {
        const key = action.payload.author?.toLowerCase();
        if (key && key in state.tweetCounts) {
          state.tweetCounts[key] = Math.max(0, state.tweetCounts[key] - 1);
        }
      });
  },
});

/** Initial store state for a profile page. */
export function profileState(user: IUserProfile): ProfilesState {
  return { tweetCounts: { [user.username.toLowerCase()]: user.tweetCount } };
}

export function selectTweetCount(
  state: { profiles: ProfilesState },
  user: IUserProfile
): number {
  return (
    state.profiles.tweetCounts[user.username.toLowerCase()] ?? user.tweetCount
  );
}

export default profilesSlice.reducer;
