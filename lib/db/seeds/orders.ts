import { orderSchedule, priceOrder } from "../../superapp/orders";
import { PlaceId } from "../../../types/Superapp";
import { IAuthor } from "../../../types/User";
import { OrderRecord } from "../orders/records";
import { createBusinessSeed } from "./business";
import { createCoreSeed, DEMO_USERNAME } from "./core";
import { createShopSeed } from "./shop";
import { LaneSeed, SeedContext, SeedTransfer } from "./types";
import { superappUsers } from "./users";

/** C2's orders; their payments are contributed to the shared ledger. */
export interface OrdersSeed {
  orders: OrderRecord[];
}

const HOUR = 60;
const DAY = 24 * HOUR;

interface SeedOrder {
  id: string;
  code: string;
  /** The payment's id (seed transfers are named `seed-tx-…`). */
  paymentTransferId: string;
  buyer: string;
  business: string;
  items: [productId: string, quantity: number][];
  deliveryPlaceId: PlaceId;
  minutesAgo: number;
}

// Placed at time scale 1, like every seed. seed-o03 is still on its way
// (delivered about 141 minutes after the world starts), so its payment is
// held for @superapp; the other two were delivered long ago.
const ORDERS: SeedOrder[] = [
  {
    id: "seed-o01",
    code: "K7Q2",
    paymentTransferId: "seed-tx-o01",
    buyer: DEMO_USERNAME,
    business: "kizilaykahve",
    items: [
      ["seed-p-kk-latte", 1],
      ["seed-p-kk-simit", 1],
    ],
    deliveryPlaceId: "tunali",
    minutesAgo: DAY + HOUR,
  },
  {
    id: "seed-o02",
    code: "P4R8",
    paymentTransferId: "seed-tx-o02",
    buyer: "sarahcodes",
    business: "superapp",
    items: [["seed-p-sa-stickers", 1]],
    deliveryPlaceId: "odtu",
    minutesAgo: 2 * DAY,
  },
  {
    id: "seed-o03",
    code: "M2X9",
    paymentTransferId: "seed-tx-o03",
    buyer: "devmarco",
    business: "superapp",
    items: [["seed-p-sa-mug", 1]],
    deliveryPlaceId: "bahcelievler",
    minutesAgo: 40,
  },
];

/**
 * C2's part of the world: three orders priced from C1's menus and F's
 * business profiles, and their payments, each held for the business until
 * its delivery time. On its own it takes 9.00 credits from the demo user.
 */
export function createOrdersSeed(ctx: SeedContext): LaneSeed<OrdersSeed> {
  const users = new Map(
    [...createCoreSeed(ctx).users, ...superappUsers].map((user) => [
      user.username,
      user,
    ])
  );
  const profiles = new Map(
    (createBusinessSeed(ctx).data?.profiles ?? []).map((profile) => [
      profile.username,
      profile,
    ])
  );
  const products = new Map(
    (createShopSeed(ctx).data?.products ?? []).map((product) => [
      product.id,
      product,
    ])
  );
  const authorOf = (username: string): IAuthor => {
    const user = users.get(username);
    if (!user) throw new Error(`Seed order names unknown user "${username}"`);
    return {
      username: user.username,
      fullname: user.fullname,
      image: user.image,
    };
  };

  const orders = ORDERS.map((seed): OrderRecord => {
    const profile = profiles.get(seed.business);
    if (!profile) throw new Error(`Seed order "${seed.id}" has no business`);
    const price = priceOrder(
      seed.items.map(([productId, quantity]) => {
        const product = products.get(productId);
        if (!product) throw new Error(`Seed order names "${productId}"`);
        return {
          productId,
          name: product.name,
          unitPrice: product.price,
          quantity,
        };
      }),
      profile
    );
    return {
      id: seed.id,
      code: seed.code,
      buyer: authorOf(seed.buyer),
      placedBy: "buyer",
      business: { ...authorOf(seed.business), category: profile.category },
      lines: price.lines,
      subtotal: price.subtotal,
      deliveryFee: price.deliveryFee,
      total: price.total,
      deliveryPlaceId: seed.deliveryPlaceId,
      note: null,
      sourceTweetId: null,
      ...orderSchedule(new Date(ctx.at(seed.minutesAgo)), profile, 1),
      cancelledAt: null,
      cancelledBy: null,
      paymentTransferId: seed.paymentTransferId,
      refundTransferId: null,
      requestHash: null,
    };
  });

  return {
    data: { orders },
    contribution: {
      transfers: orders.map((order): SeedTransfer => ({
        id: order.paymentTransferId,
        kind: "order",
        from: order.buyer.username,
        to: order.business.username,
        amount: order.total,
        note: null,
        context: { type: "order", id: order.id, code: order.code },
        holdUntil: order.deliverAt,
        reverses: null,
        createdAt: order.placedAt,
      })),
    },
  };
}
