import {
  combineReducers,
  configureStore,
  isAction,
  Middleware,
} from "@reduxjs/toolkit";
import { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";

import activityReducer, * as activity from "./slices/activitySlice";
import cartReducer, * as cart from "./slices/cartSlice";
import channelsReducer, * as channels from "./slices/channelsSlice";
import { listenerMiddleware } from "./slices/listeners";
import messagesReducer, * as messages from "./slices/messagesSlice";
import ordersReducer, * as orders from "./slices/ordersSlice";
import profilesReducer from "./slices/profilesSlice";
import repliesReducer from "./slices/repliesSlice";
import ridesReducer, * as rides from "./slices/ridesSlice";
import sessionReducer from "./slices/sessionSlice";
import storiesReducer, * as stories from "./slices/storiesSlice";
import timelinesReducer, { TimelinesState } from "./slices/timelinesSlice";
import trendsReducer from "./slices/trendsSlice";
import tweetsReducer, {
  setReaction,
  tweetsAdapter,
} from "./slices/tweetsSlice";
import uiReducer, { showToast } from "./slices/uiSlice";
import walletReducer, * as wallet from "./slices/walletSlice";
import walletUiReducer, * as walletUi from "./slices/walletUiSlice";

const rootReducer = combineReducers({
  session: sessionReducer,
  trends: trendsReducer,
  tweets: tweetsReducer,
  timelines: timelinesReducer,
  replies: repliesReducer,
  profiles: profilesReducer,
  ui: uiReducer,
  wallet: walletReducer,
  activity: activityReducer,
  // Lane-owned slices (§12.3): each file exports its reducer and the
  // action types that follow navigations.
  walletUi: walletUiReducer,
  messages: messagesReducer,
  channels: channelsReducer,
  cart: cartReducer,
  orders: ordersReducer,
  rides: ridesReducer,
  stories: storiesReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

/** Server data a page hands to the store through `pageProps.initialState`. */
export type InitialState = Partial<RootState>;

// Outcomes of requests started before a navigation: they settle in the store
// that was current when they started (see followNavigation). Toasts about
// them (e.g. a failed like) follow too, so they show on the current page.
// Each SuperApp slice lists its own.
export const FOLLOWS_NAVIGATION: ReadonlySet<string> = new Set<string>([
  setReaction.fulfilled.type,
  setReaction.rejected.type,
  showToast.type,
  ...wallet.followsNavigation,
  ...activity.followsNavigation,
  ...walletUi.followsNavigation,
  ...messages.followsNavigation,
  ...channels.followsNavigation,
  ...cart.followsNavigation,
  ...orders.followsNavigation,
  ...rides.followsNavigation,
  ...stories.followsNavigation,
]);

/**
 * A navigation replaces the client store, but a request started before it
 * still settles in the old one. Replay its outcome in the current store, so
 * the page shows what the server confirmed rather than the optimistic guess.
 */
const followNavigation: Middleware = (api) => (next) => (action) => {
  const result = next(action);
  if (
    clientStore &&
    clientStore.getState !== api.getState &&
    isAction(action) &&
    FOLLOWS_NAVIGATION.has(action.type)
  ) {
    clientStore.dispatch(action);
  }
  return result;
};

export function makeStore(preloadedState?: InitialState) {
  return configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware()
        .prepend(listenerMiddleware.middleware)
        .concat(followNavigation),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore["dispatch"];

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

let clientStore: AppStore | undefined;
let lastInitialState: InitialState | undefined;
let historyNavigation = false;

/**
 * _app marks Back/Forward navigations, which should land where the reader
 * left the page rather than on a fresh first page.
 */
export function setHistoryNavigation(value: boolean) {
  historyNavigation = value;
}

/**
 * On Back/Forward the server sends page 1 of each timeline again. Keep the
 * pages loaded before (fresh tweets first, then the older ones not among
 * them, with the old cursor) so scroll restoration finds the same content.
 * If the fresh page does not overlap the old list, too much is new to join
 * them without a gap, so the fresh page wins.
 */
export function restoreTimelines(
  current: TimelinesState,
  incoming: TimelinesState
): TimelinesState {
  const timelines = { ...incoming };
  for (const [key, fresh] of Object.entries(incoming)) {
    const old = current[key];
    if (!old || !fresh.nextCursor) continue;
    const freshIds = new Set(fresh.ids);
    if (!old.ids.some((id) => freshIds.has(id))) continue;

    timelines[key] = {
      ...fresh,
      ids: [...fresh.ids, ...old.ids.filter((id) => !freshIds.has(id))],
      nextCursor: old.nextCursor,
    };
  }
  return timelines;
}

/** The store state after a navigation brought new server data. */
export function mergeServerState(
  current: RootState,
  incoming: InitialState,
  history: boolean
): InitialState {
  const merged: InitialState = { ...current, ...incoming };
  // Tweets are a cache shared by all timelines: keep the ones loaded before
  // (fresh copies win), so timelines kept in the store still find theirs.
  if (incoming.tweets) {
    merged.tweets = tweetsAdapter.upsertMany(
      current.tweets,
      Object.values(incoming.tweets.entities)
    );
  }
  // Timelines of other pages stay too, so going Back to them can restore
  // their loaded pages; the incoming page's own timelines are fresh.
  if (incoming.timelines) {
    merged.timelines = {
      ...current.timelines,
      ...(history
        ? restoreTimelines(current.timelines, incoming.timelines)
        : incoming.timelines),
    };
  }
  // The server can't read this device's "notifications seen" time: keep the
  // bell count the client already made, and take the rest fresh.
  if (incoming.activity && current.activity.loaded) {
    merged.activity = {
      ...incoming.activity,
      newNotifications: current.activity.newNotifications,
      seenAt: current.activity.seenAt,
      loaded: true,
    };
  }
  return merged;
}

/**
 * One store per request on the server (never shared between users). In the
 * browser the store lives across navigations; when a page arrives with new
 * server data, a fresh store starts from it, keeping client-only state such
 * as open dialogs. Creating a store, rather than dispatching into the current
 * one while rendering, keeps the first render identical to the server's.
 */
export function initializeStore(initialState?: InitialState): AppStore {
  if (typeof window === "undefined") return makeStore(initialState);

  // The same page data again (React StrictMode calls useMemo twice): keep
  // the store, so the one React renders with is the one tracked here.
  if (clientStore && initialState === lastInitialState) return clientStore;

  if (!clientStore) {
    clientStore = makeStore(initialState);
  } else if (initialState) {
    clientStore = makeStore(
      mergeServerState(clientStore.getState(), initialState, historyNavigation)
    );
  }
  lastInitialState = initialState;
  return clientStore;
}

export function useStore(initialState?: InitialState): AppStore {
  return useMemo(() => initializeStore(initialState), [initialState]);
}
