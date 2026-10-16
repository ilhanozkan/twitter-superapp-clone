import type { PendingTransfer } from "../../superapp/ledger";
import { LIMITS } from "../../superapp/limits";
import { formatCredits } from "../../superapp/money";
import {
  orderCode,
  orderSchedule,
  OrderPrice,
  PriceLine,
  priceOrder,
  stableHash,
} from "../../superapp/orders";
import { PLACES } from "../../superapp/places";
import { menuOrder } from "../../superapp/shop";
import { IBusiness } from "../../../types/Business";
import { IOrder } from "../../../types/Order";
import { IProduct } from "../../../types/Shop";
import { PlaceId } from "../../../types/Superapp";
import { IAuthor } from "../../../types/User";
import {
  InvalidStateError,
  LimitExceededError,
  NotFoundError,
  PriceChangedError,
  UnavailableError,
} from "../errors";
import {
  fundingTransferId,
  OrderRecord,
  paymentTransferId,
  refundTransferId,
} from "./records";
import { DemoOrderInput, NewOrder } from "./types";

// What placing, simulating and cancelling an order become, decided once for
// both stores. The stores gather the inputs (the business and its products
// as read now, the buyer's orders in progress) inside their critical
// section, then write the planned record and transfers in one commit.
// Every rule throws a domain error before anything is written.

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const author = ({ username, fullname, image }: IAuthor): IAuthor => ({
  username,
  fullname,
  image,
});

export interface PlannedOrder {
  record: OrderRecord;
  /** In ledger order: the demo bot's funding comes before its payment. */
  transfers: PendingTransfer[];
}

interface Clock {
  now: Date;
  timeScale: number;
}

export interface OrderContext extends Clock {
  /** The business as read now (status included), or null when there is none. */
  business: IBusiness | null;
  /** The products the app shows among the order's ids, of any business. */
  products: IProduct[];
  /** The buyer's orders in progress at `now`. */
  activeOrders: number;
}

export interface DemoOrderContext extends Clock {
  business: IBusiness | null;
  /** The business's menu, any order. */
  products: IProduct[];
  /** demo_customer as stored, who places every simulated order. */
  customer: IAuthor;
}

/** UnavailableError unless the business takes orders right now; each reason says why. */
export function assertOrderable(business: IBusiness): void {
  const name = business.fullname;
  switch (business.status.reason) {
    case "frozen":
      throw new UnavailableError(`${name} can't take orders right now`);
    case "paused":
      throw new UnavailableError(`${name} isn't taking orders right now`);
    case "closed":
      throw new UnavailableError(
        `${name} is closed · Opens ${business.hours.opens}`
      );
  }
}

function assertLines(lines: NewOrder["lines"]): void {
  const { maxLines, maxQuantity } = LIMITS.order;
  if (lines.length === 0) throw new Error("An order needs at least one line");
  if (lines.length > maxLines) {
    throw new LimitExceededError(`An order has at most ${maxLines} items`);
  }
  if (new Set(lines.map((line) => line.productId)).size !== lines.length) {
    throw new Error("Each product can be listed only once");
  }
  for (const { quantity } of lines) {
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      throw new Error("Quantities are whole numbers of at least 1");
    }
    if (quantity > maxQuantity) {
      throw new LimitExceededError(
        `You can order at most ${maxQuantity} of an item`
      );
    }
  }
}

function assertMinimum(price: OrderPrice, business: IBusiness): void {
  if (price.belowMinimum > 0) {
    throw new UnavailableError(
      `The minimum order at ${business.fullname} is ${formatCredits(business.minimumOrder)}`
    );
  }
}

function assertMaximum(price: OrderPrice): void {
  if (price.overMaximum) {
    throw new LimitExceededError(
      `An order can be at most ${formatCredits(LIMITS.order.maxTotal)}`
    );
  }
}

function plan({
  id,
  buyer,
  business,
  price,
  placedBy,
  deliveryPlaceId,
  note,
  sourceTweetId,
  requestHash,
  now,
  timeScale,
}: Clock & {
  id: string;
  buyer: IAuthor;
  business: IBusiness;
  price: OrderPrice;
  placedBy: OrderRecord["placedBy"];
  deliveryPlaceId: PlaceId;
  note: string | null;
  sourceTweetId: string | null;
  requestHash: string;
}): PlannedOrder {
  const schedule = orderSchedule(now, business, timeScale);
  const code = orderCode(id);
  const seller = author(business);
  const record: OrderRecord = {
    id,
    code,
    buyer: author(buyer),
    placedBy,
    business: { ...seller, category: business.category },
    lines: price.lines,
    subtotal: price.subtotal,
    deliveryFee: price.deliveryFee,
    total: price.total,
    deliveryPlaceId,
    note,
    sourceTweetId,
    ...schedule,
    cancelledAt: null,
    cancelledBy: null,
    paymentTransferId: paymentTransferId(id),
    refundTransferId: null,
    requestHash,
  };
  // The business is paid at once, but the credit is held until delivery,
  // so a refund before then can never fail.
  const payment: PendingTransfer = {
    id: record.paymentTransferId,
    kind: "order",
    from: author(buyer),
    to: seller,
    amount: price.total,
    note: null,
    context: { type: "order", id, code },
    holdUntil: schedule.deliverAt,
    reverses: null,
  };
  return { record, transfers: [payment] };
}

/**
 * A buyer's order. In this order it throws: NotFoundError (no such
 * business), InvalidStateError (your own business), LimitExceededError (too
 * many lines or too many of one), UnavailableError (closed, paused or
 * frozen; then sold-out or gone products, naming them), PriceChangedError
 * (`expectedTotal` is out of date), UnavailableError (below the minimum),
 * LimitExceededError (over 200.00, or 5 orders already in progress).
 * The ledger then checks the buyer's funds and freeze.
 */
export function planOrder(input: NewOrder, ctx: OrderContext): PlannedOrder {
  const { business } = ctx;
  if (!business) throw new NotFoundError("Business not found");
  if (same(input.buyer.username, business.username)) {
    throw new InvalidStateError("You can't order from your own business");
  }
  assertLines(input.lines);
  assertOrderable(business);

  const menu = new Map(
    ctx.products
      .filter((product) => same(product.business, business.username))
      .map((product) => [product.id, product])
  );
  const unavailable = input.lines.filter(
    (line) => !menu.get(line.productId)?.available
  );
  if (unavailable.length > 0) {
    const [first] = unavailable;
    const product = menu.get(first.productId);
    throw new UnavailableError(
      unavailable.length > 1
        ? "Some items are sold out or no longer available"
        : product
          ? `${product.name} is sold out`
          : "This item is no longer available",
      unavailable.map((line) => line.productId)
    );
  }

  const price = priceOrder(
    input.lines.map((line): PriceLine => {
      const product = menu.get(line.productId)!;
      return {
        productId: product.id,
        name: product.name,
        unitPrice: product.price,
        quantity: line.quantity,
      };
    }),
    business
  );
  if (price.total !== input.expectedTotal) {
    throw new PriceChangedError(input.expectedTotal, price.total);
  }
  assertMinimum(price, business);
  assertMaximum(price);
  if (ctx.activeOrders >= LIMITS.order.activePerBuyer) {
    throw new LimitExceededError(
      `You can have ${LIMITS.order.activePerBuyer} orders in progress at a time`
    );
  }

  return plan({
    ...ctx,
    id: input.operationId,
    buyer: input.buyer,
    business,
    price,
    placedBy: "buyer",
    deliveryPlaceId: input.deliveryPlaceId,
    note: input.note,
    sourceTweetId: input.sourceTweetId,
    requestHash: input.fingerprint,
  });
}

/** A number in [0, n) from the operation id, the same in every store. */
const pick = (operationId: string, salt: string, n: number) =>
  stableHash(`${operationId}:${salt}`) % n;

/**
 * The demo bot's basket: 1 or 2 available products chosen by the operation
 * id, one of each, with more of the first until the minimum is met.
 */
export function demoLines(
  operationId: string,
  available: IProduct[],
  business: Pick<IBusiness, "deliveryFee" | "minimumOrder">
): PriceLine[] {
  const pool = [...available];
  const count = Math.min(pool.length, 1 + pick(operationId, "count", 2));
  const lines: PriceLine[] = [];
  for (let i = 0; i < count; i++) {
    const [product] = pool.splice(
      pick(operationId, `item-${i}`, pool.length),
      1
    );
    lines.push({
      productId: product.id,
      name: product.name,
      unitPrice: product.price,
      quantity: 1,
    });
  }
  while (
    priceOrder(lines, business).belowMinimum > 0 &&
    lines[0].quantity < LIMITS.order.maxQuantity
  ) {
    lines[0].quantity += 1;
  }
  return lines;
}

/** Anywhere in the city but the business's own place. */
export function demoPlace(operationId: string, from: PlaceId): PlaceId {
  const places = PLACES.filter((place) => place.id !== from);
  return places[pick(operationId, "place", places.length)].id;
}

/**
 * A simulated customer order for a business's managers to practise on:
 * demo_customer is issued exactly the total ("Demo bot funding") and pays
 * it, in that order, in the same commit as the order. Throws NotFoundError,
 * UnavailableError (closed, paused, frozen, nothing available, minimum out
 * of reach) or LimitExceededError (over 200.00).
 */
export function planDemoOrder(
  input: DemoOrderInput,
  ctx: DemoOrderContext
): PlannedOrder {
  const { business } = ctx;
  if (!business) throw new NotFoundError("Business not found");
  assertOrderable(business);

  const available = menuOrder(
    ctx.products.filter((product) => same(product.business, business.username))
  ).filter((product) => product.available);
  if (available.length === 0) {
    throw new UnavailableError(
      `${business.fullname} has nothing available to order right now`
    );
  }
  const price = priceOrder(
    demoLines(input.operationId, available, business),
    business
  );
  assertMinimum(price, business);
  assertMaximum(price);

  const planned = plan({
    ...ctx,
    id: input.operationId,
    buyer: ctx.customer,
    business,
    price,
    placedBy: "demo_bot",
    deliveryPlaceId: demoPlace(input.operationId, business.placeId),
    note: null,
    sourceTweetId: null,
    requestHash: input.fingerprint,
  });
  const funding: PendingTransfer = {
    id: fundingTransferId(input.operationId),
    kind: "issue",
    from: null,
    to: author(ctx.customer),
    amount: price.total,
    note: "Demo bot funding",
    context: {
      type: "order",
      id: planned.record.id,
      code: planned.record.code,
    },
    holdUntil: null,
    reverses: null,
  };
  return { ...planned, transfers: [funding, ...planned.transfers] };
}

/**
 * The refund that cancels `order` as read now, or null when it is already
 * cancelled (cancelling is idempotent by state). The buyer may cancel until
 * the business accepts; the business until delivery. The refund reverses
 * the held payment, so it goes through even if the business has spent
 * everything it could, and even to a frozen wallet.
 */
export function planCancel(
  order: IOrder,
  as: "buyer" | "business"
): PendingTransfer | null {
  if (order.cancelledAt) return null;
  if (order.status === "delivered") {
    throw new InvalidStateError("This order was already delivered");
  }
  if (as === "buyer" && !order.canCancel.buyer) {
    throw new InvalidStateError(
      `${order.business.fullname} already accepted this order, so it can't be cancelled`
    );
  }
  if (as === "business" && !order.canCancel.business) {
    throw new InvalidStateError("This order can no longer be cancelled");
  }
  const { username, fullname, image } = order.business;
  return {
    id: refundTransferId(order.paymentTransferId),
    kind: "order_refund",
    from: { username, fullname, image },
    to: author(order.buyer),
    amount: order.total,
    note: null,
    context: { type: "order", id: order.id, code: order.code },
    holdUntil: null,
    reverses: order.paymentTransferId,
  };
}
