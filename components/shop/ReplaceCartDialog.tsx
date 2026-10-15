import { Button } from "../common/Button";
import Dialog from "../common/Dialog";

/**
 * A cart holds one business: adding from another asks before clearing it.
 * The prompt may open over a product's details, which stay open.
 */
export default function ReplaceCartDialog({
  open,
  from,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  /** The business the current cart is from. */
  from: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title="Start a new cart?"
      className="max-w-xs"
    >
      <p className="text-[15px] text-muted">
        Your cart from {from} will be cleared.
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <Button size="lg" onClick={onConfirm}>
          Start new cart
        </Button>
        <Button variant="outline" size="lg" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}
