import { createListenerMiddleware } from "@reduxjs/toolkit";

import type { AppDispatch, RootState } from "../store";

/**
 * Store side effects, such as persisting a slice to localStorage. A slice
 * file registers its own at module load with `startAppListening`, so lanes
 * add effects without editing store.ts. One middleware serves every store
 * (the server's per request, the browser's per navigation): effects receive
 * the store that dispatched.
 */
export const listenerMiddleware = createListenerMiddleware();

export const startAppListening = listenerMiddleware.startListening.withTypes<
  RootState,
  AppDispatch
>();
