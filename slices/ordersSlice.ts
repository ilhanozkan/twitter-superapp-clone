import { createSlice } from "@reduxjs/toolkit";

// Owned by the orders (C2) lane, which replaces this empty slice (§12.3).

export type OrdersState = Record<string, never>;

const ordersSlice = createSlice({
  name: "orders",
  initialState: {} as OrdersState,
  reducers: {},
});

/** Action types that settle in the current page's store after a navigation (see store.ts). */
export const followsNavigation: string[] = [];

export default ordersSlice.reducer;
