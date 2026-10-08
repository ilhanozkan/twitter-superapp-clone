import { createSlice } from "@reduxjs/toolkit";

import { IReply } from "../types/Tweet";
import { deleteTweet, postReply } from "./tweetsSlice";

/** Replies by tweet id, oldest first. */
export type RepliesState = Record<string, IReply[]>;

const repliesSlice = createSlice({
  name: "replies",
  initialState: {} as RepliesState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(postReply.fulfilled, (state, action) => {
        const reply = action.payload;
        (state[reply.tweetId] ??= []).push(reply);
      })
      .addCase(deleteTweet.fulfilled, (state, action) => {
        delete state[action.payload];
      });
  },
});

export default repliesSlice.reducer;
