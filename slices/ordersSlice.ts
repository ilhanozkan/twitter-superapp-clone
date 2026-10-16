import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import { ordersApi } from "../lib/client/ordersApi";
import type { AppDispatch, RootState } from "../store";
import { IOrder, NewOrderBody } from "../types/Order";
import { fetchActivity } from "./activitySlice";
import { balanceChanged } from "./walletSlice";

// Orders the client has seen, each as the server last sent it with the
// server's clock at that moment: the tracker, the order lists and the
// Business board re-derive stages from it (`orderAt`), and a change made
// on one surface (a cancel, a poll) shows on the others. Money is never
// optimistic: the thunks below wait for the server and settle with its
// order and wallet. They throw the ApiRequestError on failure, whose
// `code` says what to show (price_changed, unavailable...).

export interface OrderEntry {
  order: IOrder;
  /** The server's clock when `order` was read (ISO). */
  serverNow: string;
}

export interface OrdersState {
  entities: Record<string, OrderEntry>;
}

const initialState: OrdersState = { entities: {} };

const ordersSlice = createSlice({
  name: "orders",
  initialState,
  reducers: {
    /**
     * Orders read at `serverNow`. A copy older than the one kept (a slow
     * poll answering after a cancel) is ignored.
     */
    ordersReceived(
      state,
      action: PayloadAction<{ orders: IOrder[]; serverNow: string }>
    ) {
      const { orders, serverNow } = action.payload;
      for (const order of orders) {
        const kept = state.entities[order.id];
        if (!kept || Date.parse(kept.serverNow) <= Date.parse(serverNow)) {
          state.entities[order.id] = { order, serverNow };
        }
      }
    },
  },
});

export const { ordersReceived } = ordersSlice.actions;

/** Store state for orders a page read on the server. */
export function ordersState(orders: IOrder[], serverNow: string): OrdersState {
  return ordersSlice.reducer(
    initialState,
    ordersReceived({ orders, serverNow })
  );
}

type WithOrders = Pick<RootState, "orders">;

/**
 * The newer of `entry` (what a page was given) and the copy in the store,
 * so a list rendered from page data still shows a cancel made elsewhere.
 */
export function latestEntry(state: WithOrders, entry: OrderEntry): OrderEntry {
  const kept = state.orders.entities[entry.order.id];
  return kept && Date.parse(kept.serverNow) > Date.parse(entry.serverNow)
    ? kept
    : entry;
}

type Thunk<R> = (dispatch: AppDispatch, getState: () => RootState) => R;

// Live activity lists the viewer's orders in progress: refresh it now
// rather than at the next 30 s poll. (A failed refresh resolves with a
// rejected action and only delays it.)
function refreshActivity(dispatch: AppDispatch) {
  void dispatch(fetchActivity());
}

/** POST /api/orders with the Idempotency-Key the caller keeps for this order. */
export const placeOrder =
  (body: NewOrderBody, idempotencyKey: string): Thunk<Promise<OrderEntry>> =>
  async (dispatch) => {
    const { order, wallet, serverNow } = await ordersApi.placeOrder(
      body,
      idempotencyKey
    );
    dispatch(ordersReceived({ orders: [order], serverNow }));
    dispatch(balanceChanged(wallet));
    refreshActivity(dispatch);
    return { order, serverNow };
  };

/** The buyer before the business accepts, the business until delivery; refunds in full. */
export const cancelOrder =
  (id: string, as: "buyer" | "business"): Thunk<Promise<OrderEntry>> =>
  async (dispatch) => {
    const { order, wallet, serverNow } = await ordersApi.cancelOrder(id, as);
    dispatch(ordersReceived({ orders: [order], serverNow }));
    // The acting user's wallet (a manager's own, not the business's).
    dispatch(balanceChanged(wallet));
    refreshActivity(dispatch);
    return { order, serverNow };
  };

/** "Simulate a customer order · Demo bot": the demo customer pays, nobody real. */
export const simulateOrder =
  (business: string, idempotencyKey: string): Thunk<Promise<OrderEntry>> =>
  async (dispatch) => {
    const { order, serverNow } = await ordersApi.simulateOrder(
      business,
      idempotencyKey
    );
    dispatch(ordersReceived({ orders: [order], serverNow }));
    return { order, serverNow };
  };

/** GET /api/orders/:id into the store (the tracker's poll). */
export const refreshOrder =
  (id: string): Thunk<Promise<OrderEntry>> =>
  async (dispatch) => {
    const { order, serverNow } = await ordersApi.getOrder(id);
    dispatch(ordersReceived({ orders: [order], serverNow }));
    return { order, serverNow };
  };

/** Action types that settle in the current page's store after a navigation (see store.ts). */
export const followsNavigation: string[] = [ordersReceived.type];

export default ordersSlice.reducer;
