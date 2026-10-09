import { createSlice } from "@reduxjs/toolkit";

// Owned by the stories (E) lane, which replaces this empty slice (§12.3).

export type StoriesState = Record<string, never>;

const storiesSlice = createSlice({
  name: "stories",
  initialState: {} as StoriesState,
  reducers: {},
});

/** Action types that settle in the current page's store after a navigation (see store.ts). */
export const followsNavigation: string[] = [];

export default storiesSlice.reducer;
