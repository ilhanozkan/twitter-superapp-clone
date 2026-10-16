import { OrderPrice } from "../../lib/superapp/orders";
import Money from "../superapp/Money";

/** Subtotal, delivery fee and total, as the server will charge them. */
export default function PriceSummary({
  price,
}: {
  price: Pick<OrderPrice, "subtotal" | "deliveryFee" | "total">;
}) {
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-[15px]">
      <dt className="text-muted">Subtotal</dt>
      <dd className="text-right">
        <Money amount={price.subtotal} />
      </dd>
      <dt className="text-muted">Delivery fee</dt>
      <dd className="text-right">
        {price.deliveryFee > 0 ? <Money amount={price.deliveryFee} /> : "Free"}
      </dd>
      <dt className="font-bold">Total</dt>
      <dd className="text-right font-bold">
        <Money amount={price.total} />
      </dd>
    </dl>
  );
}
