import type { NextApiRequest } from "next";
import { z } from "zod";

import { USERNAME_PATTERN } from "../constants";
import { getRepository } from "../db";
import { canManageBusiness } from "../superapp/policy/business";
import { BUSINESS_CATEGORIES } from "../superapp/shop";
import { IBusiness, BusinessCategory } from "../../types/Business";
import { IProduct } from "../../types/Shop";
import { notFound } from "./errors";
import { routeKey } from "./validation";

// Request schemas and shared steps of the business and product routes.
// Writes are for the business's managers only; to anyone else a business
// or product they can't run answers 404, as if it weren't there.

export const businessesQuery = z.object({
  category: z
    .enum(BUSINESS_CATEGORIES as [BusinessCategory, ...BusinessCategory[]], {
      error: `category must be one of ${BUSINESS_CATEGORIES.join(", ")}`,
    })
    .optional(),
});

export const settingsBody = z.object({
  acceptingOrders: z.boolean({
    error: "acceptingOrders must be true or false",
  }),
});

export const availabilityBody = z.object({
  available: z.boolean({ error: "available must be true or false" }),
});

const BUSINESS_NOT_FOUND = "Business not found";
const PRODUCT_NOT_FOUND = "Product not found";

/** The `[username]` of a business route; anything that can't be a username is not found. */
export function businessParam(req: NextApiRequest): string {
  const value = req.query.username;
  if (typeof value !== "string" || !USERNAME_PATTERN.test(value)) {
    throw notFound(BUSINESS_NOT_FOUND);
  }
  return value;
}

/** The `[id]` of a product route (dot-free, like every SuperApp key). */
export const productParam = (req: NextApiRequest) =>
  routeKey(req, "id", PRODUCT_NOT_FOUND);

export async function findBusiness(username: string): Promise<IBusiness> {
  const business = await getRepository().business.getBusiness(username);
  if (!business) throw notFound(BUSINESS_NOT_FOUND);
  return business;
}

/** A business `viewer` runs; 404 for everyone else. */
export async function managedBusiness(
  username: string,
  viewer: string
): Promise<IBusiness> {
  const business = await getRepository().business.getBusiness(username);
  if (!business || !canManageBusiness(viewer, business)) {
    throw notFound(BUSINESS_NOT_FOUND);
  }
  return business;
}

export async function findProduct(id: string): Promise<IProduct> {
  const product = await getRepository().shop.getProduct(id);
  if (!product) throw notFound(PRODUCT_NOT_FOUND);
  return product;
}

/** A product of a business `viewer` runs; 404 for everyone else. */
export async function managedProduct(
  id: string,
  viewer: string
): Promise<IProduct> {
  const product = await findProduct(id);
  const business = await getRepository().business.getBusiness(product.business);
  if (!business || !canManageBusiness(viewer, business)) {
    throw notFound(PRODUCT_NOT_FOUND);
  }
  return product;
}
