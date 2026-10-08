import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";

import profilesReducer from "./slices/profilesSlice";
import repliesReducer from "./slices/repliesSlice";
import sessionReducer from "./slices/sessionSlice";
import timelinesReducer, { TimelinesState } from "./slices/timelinesSlice";
import trendsReducer from "./slices/trendsSlice";
import tweetsReducer, { tweetsAdapter } from "./slices/tweetsSlice";
import uiReducer from "./slices/uiSlice";

const rootReducer = combineReducers({
  session: sessionReducer,
  trends: trendsReducer,
  tweets: tweetsReducer,
  timelines: timelinesReducer,
  replies: repliesReducer,
  profiles: profilesReducer,
  ui: uiReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

/** Server data a page hands to the store through `pageProps.initialState`. */
export type InitialState = Partial<RootState>;

export function makeStore(preloadedState?: InitialState) {
  return configureStore({ reducer: rootReducer, preloadedState });
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore["dispatch"];

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

let clientStore: AppStore | undefined;
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
  if (history && incoming.timelines) {
    merged.timelines = restoreTimelines(current.timelines, incoming.timelines);
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

  if (!clientStore) {
    clientStore = makeStore(initialState);
  } else if (initialState) {
    clientStore = makeStore(
      mergeServerState(clientStore.getState(), initialState, historyNavigation)
    );
  }
  return clientStore;
}

export function useStore(initialState?: InitialState): AppStore {
  return useMemo(() => initializeStore(initialState), [initialState]);
}
