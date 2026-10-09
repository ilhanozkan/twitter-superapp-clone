import { createSlice } from "@reduxjs/toolkit";

// Owned by the wallet (A) lane, which replaces this empty slice (§12.3).

export type WalletUiState = Record<string, never>;

const walletUiSlice = createSlice({
  name: "walletUi",
  initialState: {} as WalletUiState,
  reducers: {},
});

/** Action types that settle in the current page's store after a navigation (see store.ts). */
export const followsNavigation: string[] = [];

export default walletUiSlice.reducer;
