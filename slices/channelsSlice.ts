import { createSlice } from "@reduxjs/toolkit";

// Owned by the channels (B2) lane, which replaces this empty slice (§12.3).

export type ChannelsState = Record<string, never>;

const channelsSlice = createSlice({
  name: "channels",
  initialState: {} as ChannelsState,
  reducers: {},
});

/** Action types that settle in the current page's store after a navigation (see store.ts). */
export const followsNavigation: string[] = [];

export default channelsSlice.reducer;
