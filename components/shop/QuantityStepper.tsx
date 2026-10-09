import { Ref } from "react";
import { HiMinus, HiPlus } from "react-icons/hi2";

const STEP =
  "flex h-9 w-9 items-center justify-center rounded-full text-lg text-primary transition-colors hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-50";

/**
 * How many of a product are in the cart, with buttons named for the item
 * ("Remove one Pistachio latte", "Add one Pistachio latte").
 */
export default function QuantityStepper({
  name,
  quantity,
  max,
  onAdd,
  onRemove,
  addDisabled = false,
  addDescribedBy,
  addRef,
  removeRef,
}: {
  name: string;
  quantity: number;
  max: number;
  onAdd: () => void;
  onRemove: () => void;
  /** More can't be added now (the reason is in `addDescribedBy`). */
  addDisabled?: boolean;
  addDescribedBy?: string;
  addRef?: Ref<HTMLButtonElement>;
  removeRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <div
      role="group"
      aria-label={`${name} in your cart`}
      className="inline-flex items-center rounded-full border border-line"
    >
      <button
        ref={removeRef}
        type="button"
        aria-label={`Remove one ${name}`}
        onClick={onRemove}
        className={STEP}
      >
        <HiMinus aria-hidden="true" />
      </button>
      <span className="min-w-7 text-center text-[15px] font-bold tabular-nums">
        {quantity}
      </span>
      <button
        ref={addRef}
        type="button"
        aria-label={`Add one ${name}`}
        aria-describedby={addDisabled ? addDescribedBy : undefined}
        disabled={addDisabled || quantity >= max}
        onClick={onAdd}
        className={STEP}
      >
        <HiPlus aria-hidden="true" />
      </button>
    </div>
  );
}
