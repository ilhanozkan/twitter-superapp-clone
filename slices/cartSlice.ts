import { createSlice, isAnyOf, PayloadAction } from "@reduxjs/toolkit";

import { Cents } from "../types/Money";
import { startAppListening } from "./listeners";

// The cart: one business at a time, kept on this device in localStorage
// "cart:v1" (guarded by try/catch: storage can be full, blocked or absent).
// The server renders every page with an empty cart; the shop's `useCart`
// restores the stored one once the page runs, so the first client render
// matches the server's HTML.

export const CART_STORAGE_KEY = "cart:v1";
/** Different products in one cart. */
export const CART_MAX_LINES = 10;
/** Of one product (POST /api/orders takes 1..20). */
export const CART_MAX_QUANTITY = 20;

export interface CartLine {
  productId: string;
  name: string;
  /** The price when it was added; checkout prices the order again. */
  unitPrice: Cents;
  quantity: number;
}

/** Whose cart it is: enough to name it without loading the business. */
export interface CartBusiness {
  username: string;
  fullname: string;
}

export interface StoredCart {
  business: CartBusiness | null;
  lines: CartLine[];
}

export interface CartState extends StoredCart {
  /** The stored cart has been read on this device. */
  restored: boolean;
}

const initialState: CartState = { business: null, lines: [], restored: false };

export const isCartOf = (cart: StoredCart, username: string) =>
  !!cart.business &&
  cart.business.username.toLowerCase() === username.toLowerCase();

const cartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {
    cartRestored(state, action: PayloadAction<StoredCart | null>) {
      state.business = action.payload?.business ?? null;
      state.lines = action.payload?.lines ?? [];
      state.restored = true;
    },
    /**
     * One more of a product. A product of another business starts a new
     * cart (the UI asks first: "Start a new cart?"). A new line is ignored
     * once the cart holds CART_MAX_LINES products.
     */
    itemAdded(
      state,
      action: PayloadAction<{
        business: CartBusiness;
        product: { id: string; name: string; price: Cents };
      }>
    ) {
      const { business, product } = action.payload;
      if (!isCartOf(state, business.username)) state.lines = [];
      state.business = {
        username: business.username,
        fullname: business.fullname,
      };

      const line = state.lines.find((item) => item.productId === product.id);
      if (line) {
        line.quantity = Math.min(CART_MAX_QUANTITY, line.quantity + 1);
      } else if (state.lines.length < CART_MAX_LINES) {
        state.lines.push({
          productId: product.id,
          name: product.name,
          unitPrice: product.price,
          quantity: 1,
        });
      }
    },
    /** One fewer; a line goes at 0, and an empty cart belongs to no one. */
    itemRemoved(state, action: PayloadAction<string>) {
      const line = state.lines.find(
        (item) => item.productId === action.payload
      );
      if (!line) return;
      line.quantity -= 1;
      if (line.quantity <= 0) {
        state.lines = state.lines.filter(
          (item) => item.productId !== action.payload
        );
      }
      if (state.lines.length === 0) state.business = null;
    },
    /** A whole line goes, whatever its quantity (checkout's Remove on a sold-out item). */
    lineRemoved(state, action: PayloadAction<string>) {
      state.lines = state.lines.filter(
        (item) => item.productId !== action.payload
      );
      if (state.lines.length === 0) state.business = null;
    },
    cartCleared(state) {
      state.business = null;
      state.lines = [];
    },
    /**
     * The cart becomes these lines ("Order again" refills it from an
     * order), within the cart's limits. The UI asks first when it holds
     * another business's items.
     */
    cartReplaced(state, action: PayloadAction<StoredCart>) {
      const lines = action.payload.lines
        .filter((line) => line.quantity > 0)
        .slice(0, CART_MAX_LINES)
        .map((line) => ({
          ...line,
          quantity: Math.min(line.quantity, CART_MAX_QUANTITY),
        }));
      state.business = lines.length > 0 ? action.payload.business : null;
      state.lines = lines;
    },
  },
});

export const {
  cartRestored,
  itemAdded,
  itemRemoved,
  lineRemoved,
  cartCleared,
  cartReplaced,
} = cartSlice.actions;

type WithCart = { cart: CartState };

/** Items in the cart, counting each unit. */
export const selectCartCount = (state: WithCart) =>
  state.cart.lines.reduce((sum, line) => sum + line.quantity, 0);

/** What the items cost at the prices they were added with (no delivery fee). */
export const selectCartSubtotal = (state: WithCart): Cents =>
  state.cart.lines.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0
  );

export const selectQuantity = (state: WithCart, productId: string) =>
  state.cart.lines.find((line) => line.productId === productId)?.quantity ?? 0;

// A stored cart is untrusted input (an older version, a hand edit): keep
// only well-formed lines.
const isText = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 200;

function readLine(value: unknown): CartLine | null {
  if (!value || typeof value !== "object") return null;
  const { productId, name, unitPrice, quantity } = value as CartLine;
  if (!isText(productId) || !isText(name)) return null;
  if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) return null;
  if (!Number.isInteger(quantity) || quantity < 1) return null;
  return {
    productId,
    name,
    unitPrice,
    quantity: Math.min(quantity, CART_MAX_QUANTITY),
  };
}

/** The cart stored on this device; null when there is none or it can't be read. */
export function readStoredCart(): StoredCart | null {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredCart> | null;
    const business = value?.business;
    if (
      !business ||
      !isText(business.username) ||
      !isText(business.fullname) ||
      !Array.isArray(value.lines)
    ) {
      return null;
    }
    const lines = value.lines
      .map(readLine)
      .filter((line): line is CartLine => line !== null)
      .slice(0, CART_MAX_LINES);
    if (lines.length === 0) return null;
    return {
      business: { username: business.username, fullname: business.fullname },
      lines,
    };
  } catch {
    return null;
  }
}

function writeStoredCart({ business, lines }: StoredCart) {
  try {
    if (lines.length === 0) {
      window.localStorage.removeItem(CART_STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify({ business, lines })
      );
    }
  } catch {
    // Not saved on this device (private mode, full or blocked storage):
    // the cart still works on this page.
  }
}

// Every change the viewer makes is saved; restoring only reads.
startAppListening({
  matcher: isAnyOf(
    itemAdded,
    itemRemoved,
    lineRemoved,
    cartCleared,
    cartReplaced
  ),
  effect: (_action, api) => {
    if (typeof window !== "undefined") writeStoredCart(api.getState().cart);
  },
});

/** Action types that settle in the current page's store after a navigation (see store.ts). */
export const followsNavigation: string[] = [];

export default cartSlice.reducer;
