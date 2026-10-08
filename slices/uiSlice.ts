import { createSlice } from "@reduxjs/toolkit";

export interface UiState {
  composeOpen: boolean;
}

const initialState: UiState = { composeOpen: false };

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    openCompose(state) {
      state.composeOpen = true;
    },
    closeCompose(state) {
      state.composeOpen = false;
    },
  },
});

export const { openCompose, closeCompose } = uiSlice.actions;
export default uiSlice.reducer;
