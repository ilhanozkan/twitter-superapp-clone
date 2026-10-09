import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import { TweetAttachmentInput } from "../types/Tweet";

export interface Toast {
  id: number;
  message: string;
  /** Optional link shown next to the message, e.g. "View" a new tweet. */
  action?: { label: string; href: string };
  tone?: "default" | "error";
}

/**
 * Global dialogs. The SuperApp ones are rendered by each lane's
 * `<Lane>Dialogs` (loaded on demand by AppShell) and read `dialogArgs`.
 */
export type DialogName =
  | "compose"
  | "display"
  | "shortcuts"
  | "send"
  | "request"
  | "topUp"
  | "tip"
  | "newMessage"
  | "quickOrder"
  | "storyComposer"
  | "storyViewer";

export type ModalDialogName = Exclude<DialogName, "compose">;

/** What the compose dialog starts with, e.g. "Tweet about it" after an order. */
export interface ComposePrefill {
  text?: string;
  attachment?: TweetAttachmentInput;
}

export interface UiState {
  composeOpen: boolean;
  composePrefill: ComposePrefill | null;
  dialog: ModalDialogName | null;
  /** Arguments of the open dialog, e.g. { to: "sarahcodes" } or { tweetId }. */
  dialogArgs: Record<string, string> | null;
  toasts: Toast[];
}

const initialState: UiState = {
  composeOpen: false,
  composePrefill: null,
  dialog: null,
  dialogArgs: null,
  toasts: [],
};

const MAX_TOASTS = 3;
let nextToastId = 1;

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    openCompose: {
      reducer(state, action: PayloadAction<ComposePrefill | null>) {
        state.composeOpen = true;
        // A bare { type } (no payload) opens an empty composer too.
        state.composePrefill = action.payload ?? null;
      },
      prepare(prefill?: ComposePrefill) {
        return { payload: prefill ?? null };
      },
    },
    closeCompose(state) {
      state.composeOpen = false;
      state.composePrefill = null;
    },
    openDialog: {
      reducer(
        state,
        action: PayloadAction<{
          name: ModalDialogName;
          args: Record<string, string> | null;
        }>
      ) {
        state.dialog = action.payload.name;
        state.dialogArgs = action.payload.args;
      },
      prepare(name: ModalDialogName, args?: Record<string, string>) {
        return { payload: { name, args: args ?? null } };
      },
    },
    closeDialog(state) {
      state.dialog = null;
      state.dialogArgs = null;
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
