import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { api } from "../lib/client/api";
import { IAuthor } from "../types/User";

export interface SessionState {
  viewer: IAuthor | null;
  /** The server rejects writes (READ_ONLY=true): hide write controls. */
  readOnly: boolean;
  loading?: boolean;
}

const initialState: SessionState = { viewer: null, readOnly: false };

/** Pages without server-side props (404, 500) load the session on the client. */
export const fetchSession = createAsyncThunk<
  { viewer: IAuthor; readOnly: boolean },
  void,
  { state: { session: SessionState } }
>(
  "session/fetch",
  async () => {
    const { user, readOnly } = await api.me();
    return {
      viewer: {
        username: user.username,
        fullname: user.fullname,
        image: user.image,
      },
      readOnly,
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
