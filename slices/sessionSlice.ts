import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { api } from "../lib/client/api";
import { NO_FEATURES } from "../lib/superapp/features";
import { IFeatures } from "../types/Superapp";
import { IAuthor } from "../types/User";

export interface SessionState {
  viewer: IAuthor | null;
  /** The server rejects writes (READ_ONLY=true): hide write controls. */
  readOnly: boolean;
  /** SuperApp features that are on: their nav items, tiles and buttons show. */
  features: IFeatures;
  /** Businesses the viewer can run (their own, plus delegations). */
  managedBusinesses: string[];
  loading?: boolean;
}

/** A session from what a page knows; SuperApp fields default to "nothing on". */
export function sessionState(
  init: Pick<SessionState, "viewer" | "readOnly"> & Partial<SessionState>
): SessionState {
  return { features: NO_FEATURES, managedBusinesses: [], ...init };
}

const initialState = sessionState({ viewer: null, readOnly: false });

/** Pages without server-side props (404, 500) load the session on the client. */
export const fetchSession = createAsyncThunk<
  Omit<SessionState, "loading">,
  void,
  { state: { session: SessionState } }
>(
  "session/fetch",
  async () => {
    const { user, readOnly, features, managedBusinesses } = await api.me();
    return {
      viewer: {
        username: user.username,
        fullname: user.fullname,
        image: user.image,
      },
      readOnly,
      features,
      managedBusinesses,
    };
  },
  {
    condition: (_, { getState }) => {
      const { viewer, loading } = getState().session;
      return !viewer && !loading;
    },
  }
);

const sessionSlice = createSlice({
  name: "session",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchSession.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchSession.fulfilled, (_state, action) => action.payload)
      .addCase(fetchSession.rejected, (state) => {
        state.loading = false;
      });
  },
});

export default sessionSlice.reducer;
