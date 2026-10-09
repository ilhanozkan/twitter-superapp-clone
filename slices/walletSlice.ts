import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

import { walletApi } from "../lib/client/walletApi";
import { WalletResponse } from "../types/Api";
import { IWallet, IWalletLimits } from "../types/Wallet";

export interface WalletState {
  wallet: IWallet | null;
  limits: IWalletLimits | null;
  loaded: boolean;
}

const initialState: WalletState = { wallet: null, limits: null, loaded: false };

/** The viewer's wallet and limits (pages without server data, refreshes). */
export const fetchWallet = createAsyncThunk<WalletResponse>(
  "wallet/fetch",
  () => walletApi.getWallet()
);

const walletSlice = createSlice({
  name: "wallet",
  initialState,
  reducers: {
    /**
     * Every money response carries the acting user's wallet afterwards, and
     * every thunk that moves money dispatches it: balances are never guessed.
     */
    balanceChanged(state, action: PayloadAction<IWallet>) {
      state.wallet = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchWallet.fulfilled, (_state, action) => ({
      wallet: action.payload.wallet,
      limits: action.payload.limits,
      loaded: true,
    }));
  },
});

export const { balanceChanged } = walletSlice.actions;

/** A balance confirmed by the server stays true after the user navigates on. */
export const followsNavigation: string[] = [
  balanceChanged.type,
  fetchWallet.fulfilled.type,
];

export default walletSlice.reducer;
