import { createSlice } from "@reduxjs/toolkit";

// Owned by the messages (B1) lane, which replaces this empty slice (§12.3).

export type MessagesState = Record<string, never>;

const messagesSlice = createSlice({
  name: "messages",
  initialState: {} as MessagesState,
  reducers: {},
});

/** Action types that settle in the current page's store after a navigation (see store.ts). */
export const followsNavigation: string[] = [];

export default messagesSlice.reducer;
