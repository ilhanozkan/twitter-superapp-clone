import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

import { walletApi } from "../lib/client/walletApi";
import { ActivityResponse } from "../types/Api";
import { ILiveActivity } from "../types/Superapp";
import { startAppListening } from "./listeners";

/** When Notifications was last opened on this device (per device, documented). */
export const NOTIFICATIONS_SEEN_KEY = "notificationsSeenAt";

export interface ActivityState {
  unreadConversations: number;
  /** Notifications newer than this device's last visit to Notifications. */
  newNotifications: number;
  live: ILiveActivity[];
  serverNow: string | null;
  /**
   * The client has counted with its own `since`. Server-rendered state
   * counts every notification (the server can't read localStorage), so the
   * bell's badge waits for this.
   */
  loaded: boolean;
  /** Set when Notifications is opened here: counts from before it are stale. */
  seenAt: string | null;
  /**
   * What changed in the last poll ("Order from Kızılay Kahve: On the way"),
   * for a polite live region. Only status changes are announced.
   */
  announcement: string;
}

export const initialActivityState: ActivityState = {
  unreadConversations: 0,
  newNotifications: 0,
  live: [],
  serverNow: null,
  loaded: false,
  seenAt: null,
  announcement: "",
};

export function readNotificationsSeenAt(): string | null {
  try {
    return window.localStorage.getItem(NOTIFICATIONS_SEEN_KEY);
  } catch {
    return null;
  }
}

/** GET /api/activity with this device's `since`. */
export const fetchActivity = createAsyncThunk<
  ActivityResponse & { since: string | null }
>("activity/fetch", async () => {
  const since = readNotificationsSeenAt();
  return { ...(await walletApi.activity(since)), since };
});

const activitySlice = createSlice({
  name: "activity",
  initialState: initialActivityState,
  reducers: {
    /** Notifications was opened: the bell clears (stored by the listener below). */
    notificationsSeen: {
      reducer(state, action: PayloadAction<string>) {
        state.newNotifications = 0;
        state.seenAt = action.payload;
      },
      prepare(at?: string) {
        return { payload: at ?? new Date().toISOString() };
      },
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchActivity.fulfilled, (state, action) => {
      const { since, ...activity } = action.payload;
      const before = new Map(
        state.live.map((item) => [`${item.kind}:${item.id}`, item.status])
      );
      state.announcement = activity.live
        .filter((item) => {
          const status = before.get(`${item.kind}:${item.id}`);
          return status !== undefined && status !== item.status;
        })
        .map((item) => `${item.title}: ${item.status}`)
        .join(". ");
      state.unreadConversations = activity.unreadConversations;
      state.live = activity.live;
      state.serverNow = activity.serverNow;
      state.loaded = true;
      // A poll sent before Notifications was opened counted what is now seen.
      if (!state.seenAt || (since !== null && since >= state.seenAt)) {
        state.newNotifications = activity.newNotifications;
      }
    });
  },
});

export const { notificationsSeen } = activitySlice.actions;

startAppListening({
  actionCreator: notificationsSeen,
  effect: (action) => {
    try {
      window.localStorage.setItem(NOTIFICATIONS_SEEN_KEY, action.payload);
    } catch {
      // Storage disabled: the badge clears for this page's lifetime only.
    }
  },
});

/** Store state from the server's shell activity (the client recounts the bell). */
export function activityState(activity: ActivityResponse): ActivityState {
  return { ...initialActivityState, ...activity, loaded: false };
}

export const followsNavigation: string[] = [
  fetchActivity.fulfilled.type,
  notificationsSeen.type,
];

export default activitySlice.reducer;
