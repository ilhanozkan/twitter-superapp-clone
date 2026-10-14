import { legProgress } from "../../lib/superapp/timeline";
import { IOrder } from "../../types/Order";
import { IPlace } from "../../types/Superapp";

/** How far the courier is, 0 (at the business) to 1 (delivered). */
export function courierFraction(order: IOrder, now: number): number {
  switch (order.status) {
    case "delivered":
      return 1;
    case "on_the_way":
      return legProgress(order.onTheWayAt, order.deliverAt, new Date(now));
    default:
      return 0;
  }
}

function whereText(order: IOrder, fraction: number, from: string): string {
  if (order.status === "cancelled") return "The order was cancelled.";
  if (order.status === "delivered") return "The order has arrived.";
  if (order.status !== "on_the_way") return `The order is at ${from}.`;
  // Tens of percent: the label is no countdown.
  return `The courier is about ${Math.round(fraction * 10) * 10}% of the way.`;
}

/**
 * A slim schematic line from the business's place to the delivery place,
 * with the courier's dot placed by time. The dot glides between the
 * tracker's one-second updates, and jumps under reduced motion. The same
 * information is text (the label, the stages), never the drawing alone.
 */
export default function ProgressLine({
  order,
  from,
  now,
}: {
  order: IOrder;
  /** Where the business is; its name stands in when it is unknown. */
  from: IPlace | null;
  now: number;
}) {
  const fraction = courierFraction(order, now);
  const start = from?.name ?? order.business.fullname;
  const end = order.deliveryPlace.name;
  const percent = `${fraction * 100}%`;
  const cancelled = order.status === "cancelled";

  return (
    <div className="px-4 py-3">
      <div
        role="img"
        aria-label={`Schematic route from ${start} to ${end}. ${whereText(order, fraction, start)}`}
      >
        <div className="flex justify-between gap-4 text-[13px] font-bold">
          <span className="min-w-0 truncate">{start}</span>
          <span className="min-w-0 truncate text-right">{end}</span>
        </div>
        <div className="relative mx-2 my-3 h-1 rounded-full bg-fg/20">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-1000 motion-safe:ease-linear"
            style={{ width: percent }}
          />
          {!cancelled && (
            <span
              className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-primary motion-safe:transition-[left] motion-safe:duration-1000 motion-safe:ease-linear"
              style={{ left: percent }}
            />
          )}
        </div>
      </div>
      <p className="text-[13px] text-muted">Schematic, not to scale · demo</p>
    </div>
  );
}
