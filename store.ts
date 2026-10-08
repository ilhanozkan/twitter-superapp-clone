import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";

import repliesReducer from "./slices/repliesSlice";
import sessionReducer from "./slices/sessionSlice";
import timelinesReducer from "./slices/timelinesSlice";
import trendsReducer from "./slices/trendsSlice";
import tweetsReducer from "./slices/tweetsSlice";
import uiReducer from "./slices/uiSlice";

const rootReducer = combineReducers({
  session: sessionReducer,
  trends: trendsReducer,
  tweets: tweetsReducer,
  timelines: timelinesReducer,
  replies: repliesReducer,
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
    clientStore = makeStore({ ...clientStore.getState(), ...initialState });
  }
  return clientStore;
}

export function useStore(initialState?: InitialState): AppStore {
  return useMemo(() => initializeStore(initialState), [initialState]);
}
