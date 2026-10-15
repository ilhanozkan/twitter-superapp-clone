import Link from "next/link";
import { useState } from "react";

import { selectCartCount, selectCartSubtotal } from "../../slices/cartSlice";
import { useAppSelector } from "../../store";
import CartStatus from "./CartStatus";
import { cartText } from "./format";
import { useBottomScrollPadding } from "../layout/useBottomScrollPadding";
import { useCart, useCartSync } from "./useCart";

/** Where the cart is reviewed and paid (the orders feature's page). */
export const CHECKOUT_PATH = "/checkout";

/**
 * "View cart · 3 items · 14.50 credits", sticky at the bottom of the main
 * column (above the tab bar on phones), with focus kept from going under
 * it. The cart's total is also in a polite live region, so steppers
 * elsewhere on the page are heard to work. Like Add, it needs the orders
 * feature.
 */
export default function CartBar() {
  const ordersOn = useAppSelector((state) => state.session.features.orders);
  useCart();
  useCartSync();
  const count = useAppSelector(selectCartCount);
  const subtotal = useAppSelector(selectCartSubtotal);
  const [bar, setBar] = useState<HTMLDivElement | null>(null);
  useBottomScrollPadding(bar);
  if (!ordersOn) return null;

  const summary = cartText(count, subtotal);
  return (
    <>
      <CartStatus />
      {count > 0 && (
        <div
          ref={setBar}
          // The margin around the pill shows the menu through it, so taps
          // there reach the menu.
          className="pointer-events-none sticky bottom-[calc(53px+env(safe-area-inset-bottom))] z-10 px-4 pb-3 pt-2 xs:bottom-0"
        >
          <Link
            href={CHECKOUT_PATH}
            aria-label={`View cart · ${summary}`}
            className="pointer-events-auto flex min-h-[52px] items-center justify-between gap-3 rounded-full bg-primary-fill px-5 text-[15px] font-bold text-white shadow-lg transition-colors hover:bg-primary-fill-hover"
          >
            <span className="shrink-0">View cart</span>
            <span className="min-w-0 truncate tabular-nums">{summary}</span>
          </Link>
        </div>
      )}
    </>
  );
}
