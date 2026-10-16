import Link from "next/link";
import { useId } from "react";

import { IOrder } from "../../types/Order";
import LocalTime from "../superapp/LocalTime";
import Money from "../superapp/Money";
import PriceSummary from "./PriceSummary";

const receiptPath = (transferId: string) =>
  `/wallet/transactions/${encodeURIComponent(transferId)}`;

/**
 * An order's items and receipt at the prices it was placed with (menu
 * changes never touch it), where it goes, and, for the buyer, links to
 * the payment and refund in the wallet.
 */
export default function OrderReceipt({
  order,
  showPayments,
}: {
  order: IOrder;
  /** The buyer, with the wallet on: the payment and refund are theirs to open. */
  showPayments: boolean;
}) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 border-b border-line px-4 py-4 text-[15px]"
    >
      <h2 id={headingId} className="text-xl font-extrabold">
        Details
      </h2>
      <ul className="flex flex-col gap-1">
        {order.lines.map((line) => (
          <li key={line.productId} className="flex justify-between gap-4">
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {line.name} <span className="text-muted">×{line.quantity}</span>
            </span>
            <Money amount={line.total} className="shrink-0" />
          </li>
        ))}
      </ul>
      <div className="border-t border-line pt-3">
        <PriceSummary price={order} />
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 border-t border-line pt-3">
        <dt className="text-muted">From</dt>
        <dd className="text-right [overflow-wrap:anywhere]">
          <Link
            href={`/${order.business.username}`}
            className="hover:underline"
          >
            {order.business.fullname}
          </Link>
        </dd>
        <dt className="text-muted">Deliver to</dt>
        <dd className="text-right">
          {order.deliveryPlace.name} · {order.deliveryPlace.area}
        </dd>
        {order.note && (
          <>
            <dt className="text-muted">Note</dt>
            <dd className="text-right [overflow-wrap:anywhere]">
              {order.note}
            </dd>
          </>
        )}
        <dt className="text-muted">Placed</dt>
        <dd className="text-right">
          <LocalTime iso={order.placedAt} format="date" /> ·{" "}
          <LocalTime iso={order.placedAt} />
        </dd>
      </dl>
      {showPayments && (
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <Link
            href={receiptPath(order.paymentTransferId)}
            className="text-primary hover:underline"
          >
            Paid from wallet
          </Link>
          {order.refundTransferId && (
            <Link
              href={receiptPath(order.refundTransferId)}
              className="text-primary hover:underline"
            >
              Refund
            </Link>
          )}
        </p>
      )}
    </section>
  );
}
