import {
  createSlice,
  PayloadAction,
  ThunkDispatch,
  UnknownAction,
} from "@reduxjs/toolkit";

import { BookRideBody, ridesApi } from "../lib/client/ridesApi";
import { Cents } from "../types/Money";
import { IRide, RideResponse } from "../types/Ride";
import { ITransfer } from "../types/Wallet";
import { fetchActivity } from "./activitySlice";
import { balanceChanged } from "./walletSlice";

// Rides open on the current page, as the server last derived them. Money
// is never optimistic: booking, cancelling and tipping resolve with the
// server's answer, and each puts the viewer's wallet from it in the store.

export interface RidesState {
  /** By id. Pages re-derive them on the server's clock (rideAt), so `serverNow` travels along. */
  byId: Record<string, IRide>;
  /** The server's clock when the latest of them was read (§7). */
  serverNow: string | null;
}

const initialState: RidesState = { byId: {}, serverNow: null };

const ridesSlice = createSlice({
  name: "rides",
  initialState,
  reducers: {
    rideReceived(state, action: PayloadAction<RideResponse>) {
      const { ride, serverNow } = action.payload;
      state.byId[ride.id] = ride;
      state.serverNow = serverNow;
    },
  },
});

export const { rideReceived } = ridesSlice.actions;

// Plain thunks (not createAsyncThunk), so a failure stays the
// ApiRequestError whose `code` the forms read (price_changed, unavailable...).
type RidesDispatch = ThunkDispatch<unknown, unknown, UnknownAction>;

/** Re-reads a ride (polling) into the store. */
export const fetchRide =
  (id: string) =>
  async (dispatch: RidesDispatch): Promise<IRide> => {
    const response = await ridesApi.get(id);
    dispatch(rideReceived(response));
    return response.ride;
  };

/** Books with the caller's Idempotency-Key; resolves with the new ride. */
export const bookRide =
  (body: BookRideBody, key: string) =>
  async (dispatch: RidesDispatch): Promise<IRide> => {
    const { ride, wallet, serverNow } = await ridesApi.book(body, key);
    dispatch(balanceChanged(wallet));
    dispatch(rideReceived({ ride, serverNow }));
    // The ride is live activity now (shown everywhere but its own page).
    void dispatch(fetchActivity());
    return ride;
  };

/** Cancels before pickup; the refund is in the wallet it resolves with. */
export const cancelRide =
  (id: string) =>
  async (dispatch: RidesDispatch): Promise<IRide> => {
    const { ride, wallet, serverNow } = await ridesApi.cancel(id);
    dispatch(balanceChanged(wallet));
    dispatch(rideReceived({ ride, serverNow }));
    void dispatch(fetchActivity());
    return ride;
  };

/** Tips the driver of a completed ride; resolves with the tip's transfer. */
export const tipDriver =
  (id: string, amount: Cents, key: string) =>
  async (dispatch: RidesDispatch): Promise<ITransfer> => {
    const { transfer, wallet } = await ridesApi.tip(id, amount, key);
    dispatch(balanceChanged(wallet));
    return transfer;
  };

/** Store state for a ride read on the server. */
export function ridesState(ride: IRide, serverNow: string): RidesState {
  return { byId: { [ride.id]: ride }, serverNow };
}

/** Action types that settle in the current page's store after a navigation (see store.ts). */
export const followsNavigation: string[] = [rideReceived.type];

export default ridesSlice.reducer;
