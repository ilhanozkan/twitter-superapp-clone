import { useRouter } from "next/router";
import { useState } from "react";

import { cartReplaced } from "../../slices/cartSlice";
import { useAppDispatch } from "../../store";
import { IOrder } from "../../types/Order";
import { CHECKOUT_PATH } from "../shop/CartBar";
import ReplaceCartDialog from "../shop/ReplaceCartDialog";
import { useCart } from "../shop/useCart";

/**
 * "Order again": the order's items fill the cart and checkout opens, where
 * they are priced again from the menu (and sold-out ones are marked). A
 * cart that already holds something is replaced only once the viewer says
 * so. Render `prompt` once in the component that uses it.
 */
export function useOrderAgain() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const cart = useCart();
  const [pending, setPending] = useState<IOrder | null>(null);

  const refill = (order: IOrder) => {
    dispatch(
      cartReplaced({
        business: {
          username: order.business.username,
          fullname: order.business.fullname,
        },
        lines: order.lines.map(({ productId, name, unitPrice, quantity }) => ({
          productId,
          name,
          unitPrice,
          quantity,
        })),
      })
    );
    void router.push(CHECKOUT_PATH);
  };

  const orderAgain = (order: IOrder) => {
    if (cart.lines.length > 0) setPending(order);
    else refill(order);
  };

  const prompt = (
    <ReplaceCartDialog
      open={pending !== null}
      from={cart.business?.fullname ?? ""}
      onCancel={() => setPending(null)}
      onConfirm={() => {
        if (pending) refill(pending);
        setPending(null);
      }}
    />
  );

  return { orderAgain, prompt };
}
