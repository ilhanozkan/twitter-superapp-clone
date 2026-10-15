import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface Toast {
  id: number;
  message: string;
  /** Optional link shown next to the message, e.g. "View" a new tweet. */
  action?: { label: string; href: string };
  tone?: "default" | "error";
}

export type DialogName = "compose" | "display" | "shortcuts";

export interface UiState {
  composeOpen: boolean;
  dialog: Exclude<DialogName, "compose"> | null;
  toasts: Toast[];
}

const initialState: UiState = { composeOpen: false, dialog: null, toasts: [] };

const MAX_TOASTS = 3;
let nextToastId = 1;

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
    openDialog(state, action: PayloadAction<Exclude<DialogName, "compose">>) {
      state.dialog = action.payload;
    },
    closeDialog(state) {
      state.dialog = null;
    },
    showToast: {
      reducer(state, action: PayloadAction<Toast>) {
        state.toasts.push(action.payload);
        if (state.toasts.length > MAX_TOASTS) state.toasts.shift();
      },
      prepare(toast: Omit<Toast, "id">) {
        return { payload: { ...toast, id: nextToastId++ } };
      },
    },
    dismissToast(state, action: PayloadAction<number>) {
      state.toasts = state.toasts.filter(
        (toast) => toast.id !== action.payload
      );
    },
  },
});

export const {
  openCompose,
  closeCompose,
  openDialog,
  closeDialog,
  showToast,
  dismissToast,
} = uiSlice.actions;
export default uiSlice.reducer;
