import { IBusiness } from "../../types/Business";
import { Cents } from "../../types/Money";
import { IOrder, IOrderLine, OrderStatus } from "../../types/Order";
import { LIMITS } from "./limits";
import { deriveStages } from "./timeline";

// Ordering rules shared by the server and the browser: what an order costs
// (checkout prices the cart with the same function the server charges with,
// and sends the total as `expectedTotal`), when its stages happen, and what
// can still be done at a given time. Pure and isomorphic: no Node APIs and
// no clock of its own.

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  placed: "Placed",
  accepted: "Accepted",
  on_the_way: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** A business accepts an order a demo minute after it is placed. */
export const ACCEPT_AFTER_MS = 60_000;
/** The buyer's cancel window in real time, however fast SUPERAPP_TIME_SCALE runs the demo. */
export const BUYER_CANCEL_FLOOR_MS = 15_000;

const MINUTE = 60_000;

/** One line of a cart or an order before it is priced. */
export interface PriceLine {
  productId: string;
  name: string;
  unitPrice: Cents;
  quantity: number;
}

export interface OrderPrice {
  lines: IOrderLine[];
  subtotal: Cents;
  deliveryFee: Cents;
  total: Cents;
  /** How much the subtotal is short of the business's minimum order (0 once it is met). */
  belowMinimum: Cents;
  /** The total is over LIMITS.order.maxTotal (200.00 credits). */
  overMaximum: boolean;
}

const isWhole = (value: number, min: number) =>
  Number.isSafeInteger(value) && value >= min;

/**
 * The price of an order: each line's total, the subtotal, the business's
 * delivery fee and the total, all in whole cents. Amounts are integers
 * end to end, so nothing is ever rounded and 3 × 3.50 is exactly 10.50 on
 * the server and in every browser. The minimum applies to the subtotal (the
 * fee doesn't count towards it); the maximum to the total.
 */
export function priceOrder(
  lines: PriceLine[],
  business: Pick<IBusiness, "deliveryFee" | "minimumOrder">
): OrderPrice {
  const priced = lines.map((line): IOrderLine => {
    if (!isWhole(line.unitPrice, 0) || !isWhole(line.quantity, 1)) {
      throw new Error(
        `Line "${line.productId}" has an invalid price or quantity`
      );
    }
    return {
      productId: line.productId,
      name: line.name,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      total: line.unitPrice * line.quantity,
    };
  });
  const subtotal = priced.reduce((sum, line) => sum + line.total, 0);
  const total = subtotal + business.deliveryFee;
  return {
    lines: priced,
    subtotal,
    deliveryFee: business.deliveryFee,
    total,
    belowMinimum: Math.max(0, business.minimumOrder - subtotal),
    overMaximum: total > LIMITS.order.maxTotal,
  };
}

export interface OrderSchedule {
  placedAt: string;
  acceptAt: string;
  onTheWayAt: string;
  deliverAt: string;
}

/**
 * When an order placed at `placedAt` is accepted, leaves and arrives.
 * SUPERAPP_TIME_SCALE speeds up the demo minutes, but the buyer always gets
 * at least 15 real seconds to cancel. The schedule is stored with the
 * order, so changing the scale never changes orders already placed.
 */
export function orderSchedule(
  placedAt: Date,
  {
    prepMinutes,
    deliveryMinutes,
  }: Pick<IBusiness, "prepMinutes" | "deliveryMinutes">,
  timeScale = 1
): OrderSchedule {
  const scale = Math.max(1, timeScale);
  const placed = placedAt.getTime();
  const accept =
    placed +
    Math.round(Math.max(ACCEPT_AFTER_MS / scale, BUYER_CANCEL_FLOOR_MS));
  const onTheWay = accept + Math.round((prepMinutes * MINUTE) / scale);
  const deliver = onTheWay + Math.round((deliveryMinutes * MINUTE) / scale);
  const iso = (time: number) => new Date(time).toISOString();
  return {
    placedAt: iso(placed),
    acceptAt: iso(accept),
    onTheWayAt: iso(onTheWay),
    deliverAt: iso(deliver),
  };
}

/** The stored times an order's progress is derived from. */
export type OrderTimes = Pick<
  IOrder,
  "placedAt" | "acceptAt" | "onTheWayAt" | "deliverAt" | "cancelledAt"
>;

export type OrderProgress = Pick<
  IOrder,
  "status" | "stages" | "eta" | "nextChangeAt" | "canCancel"
>;

/**
 * Where an order stands at `now`: its stages (a cancellation ends them),
 * the expected delivery while it is on its way, when it next changes, and
 * who may still cancel it: the buyer until the business accepts, the
 * business until it is delivered.
 */
export function orderProgress(order: OrderTimes, now: Date): OrderProgress {
  const stage = (status: Exclude<OrderStatus, "cancelled">, at: string) => ({
    status,
    label: ORDER_STATUS_LABELS[status],
    at,
  });
  const { status, stages, next } = deriveStages<OrderStatus>(
    [
      stage("placed", order.placedAt),
      stage("accepted", order.acceptAt),
      stage("on_the_way", order.onTheWayAt),
      stage("delivered", order.deliverAt),
    ],
    now,
    order.cancelledAt
      ? {
          status: "cancelled",
          label: ORDER_STATUS_LABELS.cancelled,
          at: order.cancelledAt,
        }
      : null
  );
  const open = !order.cancelledAt;
  const time = now.getTime();
  return {
    status,
    stages,
    eta:
      status === "delivered" || status === "cancelled" ? null : order.deliverAt,
    nextChangeAt: next?.at ?? null,
    canCancel: {
      buyer: open && time < Date.parse(order.acceptAt),
      business: open && time < Date.parse(order.deliverAt),
    },
  };
}

/** The order as it reads at `now` (the client re-derives with the server's clock between polls). */
export function orderAt(order: IOrder, now: Date): IOrder {
  return { ...order, ...orderProgress(order, now) };
}

/** Neither cancelled nor delivered at `now`: it counts towards the buyer's 5 and its payment is still held. */
export function isActiveOrder(
  order: Pick<IOrder, "deliverAt" | "cancelledAt">,
  now: Date
): boolean {
  return !order.cancelledAt && now.getTime() < Date.parse(order.deliverAt);
}

/** 32 characters that can't be mistaken for each other (no 0/O, 1/I). */
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const ORDER_CODE_PATTERN = /^[2-9A-HJ-NP-Z]{4}$/;

/** FNV-1a: a small, stable, isomorphic string hash. Not for security. */
export function stableHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * The 4-character code people read out ("K7Q2"), derived from the order's
 * id. Display only: the id stays the key, so a rare repeat is harmless.
 */
export function orderCode(orderId: string): string {
  let hash = stableHash(orderId);
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += CODE_ALPHABET[hash & 31];
    hash >>>= 5;
  }
  return code;
}

/**
 * Local midnight in `timeZone` on the day `now` falls in, as an ISO time:
 * when a business's "Today" starts. Uses the zone's offset at `now`, which
 * is exact for zones without daylight saving (Europe/Istanbul).
 */
export function startOfLocalDay(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) =>
    Number(parts.find((candidate) => candidate.type === type)?.value ?? 0);
  const local = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second")
  );
  const offset = local - (now.getTime() - now.getUTCMilliseconds());
  return new Date(
    Date.UTC(part("year"), part("month") - 1, part("day")) - offset
  ).toISOString();
}
