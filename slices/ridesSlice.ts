import { createSlice } from "@reduxjs/toolkit";

// Owned by the rides (D) lane, which replaces this empty slice (§12.3).

export type RidesState = Record<string, never>;

const ridesSlice = createSlice({
  name: "rides",
  initialState: {} as RidesState,
  reducers: {},
});

/** Action types that settle in the current page's store after a navigation (see store.ts). */
export const followsNavigation: string[] = [];

export default ridesSlice.reducer;
