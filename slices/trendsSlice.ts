import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { api } from "../lib/client/api";
import { ITrend } from "../types/Trend";

export interface TrendsState {
  items: ITrend[];
  loaded: boolean;
  loading: boolean;
}

const initialState: TrendsState = { items: [], loaded: false, loading: false };

export const fetchTrends = createAsyncThunk<
  ITrend[],
  void,
  { state: { trends: TrendsState } }
>("trends/fetch", async () => (await api.trends()).items, {
  // One request at a time, and none once loaded.
  condition: (_, { getState }) => {
    const { loaded, loading } = getState().trends;
    return !loaded && !loading;
  },
});

const trendsSlice = createSlice({
  name: "trends",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchTrends.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchTrends.fulfilled, (_state, action) => ({
        items: action.payload,
        loaded: true,
        loading: false,
      }))
      .addCase(fetchTrends.rejected, (state) => {
        state.loading = false;
      });
  },
});

export default trendsSlice.reducer;
