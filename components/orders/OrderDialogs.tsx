import { closeDialog } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import Dialog from "../common/Dialog";
import QuickOrderSheet from "./QuickOrderSheet";

/**
 * Slot (§12.3): the orders lane's global dialogs, the quick order sheet
 * (ui.dialog "quickOrder", args `{ productId, tweetId }` from a product
 * card's Order now). AppShell loads it on demand (next/dynamic, no SSR).
 */
export default function OrderDialogs() {
  const dispatch = useAppDispatch();
  const dialog = useAppSelector((state) => state.ui.dialog);
  const args = useAppSelector((state) => state.ui.dialogArgs);
  const ordersOn = useAppSelector((state) => state.session.features.orders);
  const productId = args?.productId;
  const open = dialog === "quickOrder" && ordersOn && !!productId;
  const close = () => dispatch(closeDialog());

  return (
    <Dialog open={open} onClose={close} title="Order now" variant="sheet">
      {open && (
        // A fresh sheet (and key) for every product it is opened for.
        <QuickOrderSheet
          key={`${productId}:${args?.tweetId ?? ""}`}
          productId={productId}
          tweetId={args?.tweetId || null}
          onClose={close}
        />
      )}
    </Dialog>
  );
}
