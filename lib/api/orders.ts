import type { NextApiRequest } from "next";
import { z } from "zod";

import { getRepository } from "../db";
import { LIMITS } from "../superapp/limits";
import { canViewOrder } from "../superapp/policy/orders";
import { IBusiness } from "../../types/Business";
import { IOrder } from "../../types/Order";
import { notFound } from "./errors";
import {
  note,
  pageQuery,
  placeId,
  recordKey,
  routeKey,
  username,
} from "./validation";

// Request schemas and shared steps of the order routes. The buyer is
// always the current user (lib/auth.ts): bodies name only the business,
// and unknown fields (buyer, from, username...) are dropped by the schemas.

const ORDER_NOT_FOUND = "Order not found";

const { maxLines, maxQuantity, noteMax } = LIMITS.order;

/** Far above any real order: the repository answers 422 past 200.00, so clients learn the limit. */
const MAX_EXPECTED_TOTAL = 100_000_000;

const item = z.object({
  productId: recordKey("Product id"),
  quantity: z
    .number({ error: "Quantity must be a number" })
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(maxQuantity, `Quantity must be at most ${maxQuantity}`),
});

export const placeOrderBody = z.object({
  /** The business's username; the buyer is the current user. */
  business: username,
  items: z
    .array(item, { error: "items must be a list" })
    .min(1, "Add at least one item")
    .max(maxLines, `An order has at most ${maxLines} items`)
    .superRefine((items, ctx) => {
      const seen = new Set<string>();
      items.forEach(({ productId }, index) => {
        if (seen.has(productId)) {
          ctx.addIssue({
            code: "custom",
            path: [index, "productId"],
            message: "Each product can be listed only once",
          });
        }
        seen.add(productId);
      });
    }),
  deliveryPlaceId: placeId,
  note: note(noteMax),
  /** The total the client priced with `priceOrder`; a different one is 409 price_changed. */
  expectedTotal: z
    .number({ error: "expectedTotal must be a number of cents" })
    .int("expectedTotal must be a whole number of cents")
    .min(0, "expectedTotal can't be negative")
    .max(MAX_EXPECTED_TOTAL, "expectedTotal is too large"),
  /** The Tweet whose product card the order started from. */
  sourceTweetId: recordKey("Tweet id")
    .nullish()
    .transform((id) => id ?? null),
});

export type PlaceOrderBody = z.output<typeof placeOrderBody>;

const role = z.enum(["buyer", "business"], {
  error: "as must be buyer or business",
});

export const ordersQuery = pageQuery
  .extend({
    as: role.default("buyer"),
    business: username.optional(),
    state: z
      .enum(["active", "past"], { error: "state must be active or past" })
      .optional(),
  })
  .superRefine((query, ctx) => {
    if (query.as === "business" && !query.business) {
      ctx.addIssue({
        code: "custom",
        path: ["business"],
        message: "Name the business to list its orders",
      });
    }
  });

export const cancelBody = z.object({ as: role });

export const summaryQuery = z.object({
  since: z.iso
    .datetime({ offset: true, error: "since must be an ISO date and time" })
    .optional(),
});

/** The `[id]` of an order route; anything that isn't a plain key is not found. */
export const orderParam = (req: NextApiRequest) =>
  routeKey(req, "id", ORDER_NOT_FOUND);

/**
 * An order `viewer` may see (its buyer, or someone who runs its business),
 * with its business as read now; 404 for everyone else, so ids reveal
 * nothing.
 */
export async function visibleOrder(
  id: string,
  viewer: string
): Promise<{ order: IOrder; business: IBusiness | null }> {
  const repo = getRepository();
  const order = await repo.orders.getOrder(id);
  if (!order) throw notFound(ORDER_NOT_FOUND);
  const business = await repo.business.getBusiness(order.business.username);
  if (!canViewOrder(viewer, order, business)) throw notFound(ORDER_NOT_FOUND);
  return { order, business };
}

export const orderLocation = (order: IOrder) =>
  `/api/orders/${encodeURIComponent(order.id)}`;

/** Orders are derived from the clock: every response says what time it was. */
export const serverNow = () => new Date().toISOString();
