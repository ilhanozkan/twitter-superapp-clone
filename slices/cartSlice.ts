import { createSlice } from "@reduxjs/toolkit";

// Owned by the business (C1) lane, which replaces this empty slice (§12.3).
// The cart is persisted to localStorage "cart:v1" (guarded by try/catch)
// by a listener the lane registers here with startAppListening (./listeners).

export type CartState = Record<string, never>;

const cartSlice = createSlice({
  name: "cart",
  initialState: {} as CartState,
  reducers: {},
});

/** Action types that settle in the current page's store after a navigation (see store.ts). */
export const followsNavigation: string[] = [];

export default cartSlice.reducer;
