import {
  createAsyncThunk,
  createSlice,
  PayloadAction,
  ThunkAction,
  UnknownAction,
} from "@reduxjs/toolkit";

import { walletApi } from "../lib/client/walletApi";
import { Cents } from "../types/Money";
import { IAuthor } from "../types/User";
import { IPaymentRequest, ITransfer } from "../types/Wallet";
import type { SessionState } from "./sessionSlice";
import { balanceChanged, fetchWallet } from "./walletSlice";

// The wallet lane's client state (§12.3): the wallet page's payment
// requests, what this device changed since the page was read, and the
// people Send and Request suggest.

type LoadStatus = "idle" | "loading" | "loaded" | "failed";

export interface WalletRequestsState {
  /** Asking the viewer to pay: pending when read, then as answered here. */
  incoming: IPaymentRequest[];
  /** The viewer's own requests, newest first. */
  outgoing: IPaymentRequest[];
  status: LoadStatus;
}

export interface WalletUiState {
  requests: WalletRequestsState;
  /** Transfers made on this device since the activity was read, newest first. */
  created: ITransfer[];
  /** People the viewer recently exchanged credits with, most recent first. */
  recent: { people: IAuthor[]; status: LoadStatus };
}

/** What this slice's thunks read (a slice can't import RootState: store.ts imports it). */
interface ThunkState {
  session: SessionState;
  walletUi: WalletUiState;
}

const RECENT_MAX = 6;
const RECENT_SOURCE = 50;

const initialState: WalletUiState = {
  requests: { incoming: [], outgoing: [], status: "idle" },
  created: [],
  recent: { people: [], status: "idle" },
};

/** The wallet page's server state: its requests, or a failed read (shown with Retry). */
export function walletUiState(
  requests: Pick<WalletRequestsState, "incoming" | "outgoing"> | null
): WalletUiState {
  return {
    ...initialState,
    requests: requests
      ? { ...requests, status: "loaded" }
      : { incoming: [], outgoing: [], status: "failed" },
  };
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * The other parties of payments, paid requests and tips, newest first and
 * without repeats: who the viewer is likely to pay or ask again. Orders,
 * rides and issued credits are left out.
 */
export function recentPeople(
  transfers: ITransfer[],
  viewer: string,
  max = RECENT_MAX
): IAuthor[] {
  const people: IAuthor[] = [];
  for (const transfer of transfers) {
    if (!["payment", "request", "tip"].includes(transfer.kind)) continue;
    const other = same(transfer.to.username, viewer)
      ? transfer.from
      : transfer.to;
    if (!other || same(other.username, viewer)) continue;
    if (people.some((person) => same(person.username, other.username)))
      continue;
    people.push(other);
    if (people.length === max) break;
  }
  return people;
}

/** Pending requests for the viewer to answer, and all of their own. */
export const fetchRequests = createAsyncThunk<
  Pick<WalletRequestsState, "incoming" | "outgoing">,
  void,
  { state: ThunkState }
>(
  "walletUi/fetchRequests",
  async () => {
    const [incoming, outgoing] = await Promise.all([
      walletApi.listRequests("incoming", "pending"),
      walletApi.listRequests("outgoing"),
    ]);
    return { incoming: incoming.items, outgoing: outgoing.items };
  },
  {
    condition: (_, { getState }) =>
      getState().walletUi.requests.status !== "loading",
  }
);

/** Read once per page load, from the latest activity. */
export const fetchRecentPeople = createAsyncThunk<
  IAuthor[],
  void,
  { state: ThunkState }
>(
  "walletUi/fetchRecentPeople",
  async (_, { getState }) => {
    const viewer = getState().session.viewer?.username ?? "";
    const page = await walletApi.listActivity({ limit: RECENT_SOURCE });
    return recentPeople(page.items, viewer);
  },
  {
    condition: (_, { getState }) => {
      const { status } = getState().walletUi.recent;
      return status === "idle" || status === "failed";
    },
  }
);

function remember(state: WalletUiState, person: IAuthor) {
  state.recent.people = [
    person,
    ...state.recent.people.filter((p) => !same(p.username, person.username)),
  ].slice(0, RECENT_MAX);
}

function replaceRequest(list: IPaymentRequest[], request: IPaymentRequest) {
  const index = list.findIndex((item) => item.id === request.id);
  if (index >= 0) list[index] = request;
  return index >= 0;
}

const walletUiSlice = createSlice({
  name: "walletUi",
  initialState,
  reducers: {
    /** A transfer this device made: a send, a top-up, a paid request or a tip. */
    transferCreated(state, action: PayloadAction<ITransfer>) {
      const transfer = action.payload;
      if (state.created.some((item) => item.id === transfer.id)) return;
      state.created.unshift(transfer);
      // Top-ups are issued (no sender): there is nobody to suggest.
      if (transfer.from) remember(state, transfer.to);
    },
    requestCreated(state, action: PayloadAction<IPaymentRequest>) {
      const request = action.payload;
      if (!replaceRequest(state.requests.outgoing, request)) {
        state.requests.outgoing.unshift(request);
      }
      remember(state, request.payer);
    },
    /** Paid, declined or cancelled here: its card shows the new status. */
    requestChanged(state, action: PayloadAction<IPaymentRequest>) {
      replaceRequest(state.requests.incoming, action.payload);
      replaceRequest(state.requests.outgoing, action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRequests.pending, (state) => {
        state.requests.status = "loading";
      })
      .addCase(fetchRequests.fulfilled, (state, action) => {
        state.requests = { ...action.payload, status: "loaded" };
      })
      .addCase(fetchRequests.rejected, (state) => {
        state.requests.status = "failed";
      })
      .addCase(fetchRecentPeople.pending, (state) => {
        state.recent.status = "loading";
      })
      .addCase(fetchRecentPeople.fulfilled, (state, action) => {
        // Anyone paid here while the read was in flight stays first.
        const fresh = action.payload.filter(
          (person) =>
            !state.recent.people.some((p) => same(p.username, person.username))
        );
        state.recent = {
          people: [...state.recent.people, ...fresh].slice(0, RECENT_MAX),
          status: "loaded",
        };
      })
      .addCase(fetchRecentPeople.rejected, (state) => {
        state.recent.status = "failed";
      });
  },
});

export const { transferCreated, requestCreated, requestChanged } =
  walletUiSlice.actions;

// Money operations. Plain thunks rather than createAsyncThunk: a failure
// stays the ApiRequestError the server sent (status and code), which the
// review step reads to offer "Add credits". Money is never optimistic: each
// resolves with what the server confirmed and dispatches the wallet it
// returned (balanceChanged).

export type WalletThunk<R> = ThunkAction<
  Promise<R>,
  ThunkState,
  unknown,
  UnknownAction
>;

export interface CreditsDraft {
  /** Who gets the credits (send) or is asked for them (request). */
  other: IAuthor;
  amount: Cents;
  note: string | null;
}

export const sendCredits =
  (
    { other, amount, note }: CreditsDraft,
    key: string
  ): WalletThunk<ITransfer> =>
  async (dispatch) => {
    const { transfer, wallet } = await walletApi.send(
      { to: other.username, amount, note },
      key
    );
    dispatch(balanceChanged(wallet));
    dispatch(transferCreated(transfer));
    return transfer;
  };

/** Asking moves nothing, so there is no wallet to update. */
export const requestCredits =
  (
    { other, amount, note }: CreditsDraft,
    key: string
  ): WalletThunk<IPaymentRequest> =>
  async (dispatch) => {
    const { request } = await walletApi.createRequest(
      { from: other.username, amount, note },
      key
    );
    dispatch(requestCreated(request));
    return request;
  };

export const topUpCredits =
  (amount: Cents, key: string): WalletThunk<ITransfer> =>
  async (dispatch) => {
    const { transfer, wallet } = await walletApi.topUp(amount, key);
    dispatch(balanceChanged(wallet));
    dispatch(transferCreated(transfer));
    // The limits (top-ups left today) changed too; they come with the wallet.
    void dispatch(fetchWallet());
    return transfer;
  };

export const payRequest =
  (
    request: IPaymentRequest,
    key: string
  ): WalletThunk<{ request: IPaymentRequest; transfer: ITransfer }> =>
  async (dispatch) => {
    const result = await walletApi.payRequest(request.id, key);
    dispatch(balanceChanged(result.wallet));
    dispatch(requestChanged(result.request));
    dispatch(transferCreated(result.transfer));
    return { request: result.request, transfer: result.transfer };
  };

/** Decline (the payer) or cancel (the requester); repeating either is harmless. */
export const closeRequest =
  (
    request: IPaymentRequest,
    action: "decline" | "cancel"
  ): WalletThunk<IPaymentRequest> =>
  async (dispatch) => {
    const { request: closed } =
      action === "decline"
        ? await walletApi.declineRequest(request.id)
        : await walletApi.cancelRequest(request.id);
    dispatch(requestChanged(closed));
    return closed;
  };

/** Action types that settle in the current page's store after a navigation (see store.ts). */
export const followsNavigation: string[] = [
  transferCreated.type,
  requestCreated.type,
  requestChanged.type,
];

export default walletUiSlice.reducer;
