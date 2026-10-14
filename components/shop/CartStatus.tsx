import { selectCartCount, selectCartSubtotal } from "../../slices/cartSlice";
import { useAppSelector } from "../../store";
import { cartText } from "./format";
import { useCart } from "./useCart";

/**
 * "Your cart: 3 items · 14.50 credits" in a polite live region, so Add and
 * the steppers are heard to work. A modal dialog makes the rest of the
 * page inert, live regions included: a dialog with steppers renders its
 * own. Like Add, it needs the orders feature.
 */
export default function CartStatus() {
  const ordersOn = useAppSelector((state) => state.session.features.orders);
  const { restored } = useCart();
  const count = useAppSelector(selectCartCount);
  const subtotal = useAppSelector(selectCartSubtotal);
  if (!ordersOn) return null;

  return (
    <p aria-live="polite" className="sr-only">
      {restored && count > 0 ? `Your cart: ${cartText(count, subtotal)}` : ""}
    </p>
  );
}
