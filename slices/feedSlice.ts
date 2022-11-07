import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

import { ITweet } from "../types/Tweet";

export interface FeedType {
  value: ITweet[];
}

const initialState: FeedType = {
  value: [],
};

export const feedSlice = createSlice({
  name: "feed",
  initialState,
  reducers: {
    setFeed: (state, action: PayloadAction<ITweet[]>) => {
      state.value = action.payload;
    },
  },
});

export const { setFeed } = feedSlice.actions;

export default feedSlice.reducer;
