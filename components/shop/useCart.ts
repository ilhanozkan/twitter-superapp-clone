import { useEffect } from "react";

import {
  CART_STORAGE_KEY,
  cartRestored,
  readStoredCart,
} from "../../slices/cartSlice";
import { useAppDispatch, useAppSelector } from "../../store";

/**
 * The cart, restored from this device once the page runs (the server
 * renders an empty one). Every reader restores, so a page can't add to a
 * cart before it knows what is already in it.
 */
export function useCart() {
  const dispatch = useAppDispatch();
  const cart = useAppSelector((state) => state.cart);
  const restored = cart.restored;

  useEffect(() => {
    if (!restored) dispatch(cartRestored(readStoredCart()));
  }, [dispatch, restored]);

  return cart;
}

/** Follows changes made in other tabs (one listener per page is enough). */
export function useCartSync() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === CART_STORAGE_KEY || event.key === null) {
        dispatch(cartRestored(readStoredCart()));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [dispatch]);
}
