import { useEffect, useRef, useState } from "react";

import {
  CART_MAX_LINES,
  CART_MAX_QUANTITY,
  CartBusiness,
  isCartOf,
  itemAdded,
  itemRemoved,
  selectQuantity,
} from "../../slices/cartSlice";
import { showToast } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { IProduct } from "../../types/Shop";
import { Button } from "../common/Button";
import QuantityStepper from "./QuantityStepper";
import ReplaceCartDialog from "./ReplaceCartDialog";
import { useCart } from "./useCart";

interface AddToCartProps {
  product: IProduct;
  business: CartBusiness;
  /** Nothing can be added now (closed, read-only demo)... */
  disabled?: boolean;
  /** ...for the reason this element states. */
  reasonId?: string;
}

/**
 * "Add", then a quantity stepper once the product is in the cart. Ordering
 * is the orders feature: until it is on, the cart has nowhere to go, so
 * this renders nothing. Focus follows the control that replaces the one
 * pressed (Add → "Add one", the last "Remove one" → Add).
 */
export default function AddToCart({
  product,
  business,
  disabled = false,
  reasonId,
}: AddToCartProps) {
  const dispatch = useAppDispatch();
  const ordersOn = useAppSelector((state) => state.session.features.orders);
  const cart = useCart();
  const quantity = useAppSelector((state) => selectQuantity(state, product.id));
  const [replacing, setReplacing] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const addOne = useRef<HTMLButtonElement>(null);
  const focusNext = useRef<"add" | "addOne" | null>(null);

  useEffect(() => {
    if (focusNext.current === "add") addButton.current?.focus();
    if (focusNext.current === "addOne") addOne.current?.focus();
    focusNext.current = null;
  }, [quantity]);

  if (!ordersOn) return null;

  const addNow = () => {
    if (quantity === 0) focusNext.current = "addOne";
    dispatch(
      itemAdded({
        business,
        product: { id: product.id, name: product.name, price: product.price },
      })
    );
  };

  const add = () => {
    if (cart.lines.length > 0 && !isCartOf(cart, business.username)) {
      setReplacing(true);
    } else if (quantity === 0 && cart.lines.length >= CART_MAX_LINES) {
      dispatch(
        showToast({
          message: `Your cart is full: it holds up to ${CART_MAX_LINES} different items.`,
          tone: "error",
        })
      );
    } else {
      addNow();
    }
  };

  const remove = () => {
    if (quantity === 1) focusNext.current = "add";
    dispatch(itemRemoved(product.id));
  };

  let control;
  if (!product.available) {
    // The reason is the button's text.
    control = (
      <Button size="sm" variant="outline" disabled>
        Sold out
      </Button>
    );
  } else if (quantity === 0) {
    control = (
      <Button
        ref={addButton}
        size="sm"
        aria-label={`Add ${product.name}`}
        aria-describedby={disabled ? reasonId : undefined}
        disabled={disabled}
        onClick={add}
      >
        Add
      </Button>
    );
  } else {
    control = (
      <QuantityStepper
        name={product.name}
        quantity={quantity}
        max={CART_MAX_QUANTITY}
        onAdd={add}
        onRemove={remove}
        addDisabled={disabled}
        addDescribedBy={reasonId}
        addRef={addOne}
      />
    );
  }

  return (
    <>
      {control}
      <ReplaceCartDialog
        open={replacing}
        from={cart.business?.fullname ?? ""}
        onCancel={() => setReplacing(false)}
        onConfirm={() => {
          setReplacing(false);
          addNow();
        }}
      />
    </>
  );
}
