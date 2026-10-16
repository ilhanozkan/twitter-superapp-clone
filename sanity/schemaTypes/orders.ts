import { defineArrayMember, defineField, defineType } from "sanity";
import type { StructureBuilder } from "sanity/structure";

import { BUSINESS_CATEGORIES, PLACES } from "../env";
import {
  centsField,
  formatCredits,
  partyField,
  requestHashField,
  timestampField,
  usernameKeyField,
} from "./fields";

// Orders (docs/features/orders.md) are private documents ("private." ids)
// that only the app writes, in the same transaction as their payment. Their
// payment is held for the business until `deliverAt`; cancelling writes a
// refund and the three cancel fields. An edited order would no longer match
// its transfers, so the type is locked and read-only. Progress (placed,
// accepted, on the way, delivered) is derived from the stored times.

const orderType = defineType({
  name: "order",
  title: "Order",
  type: "document",
  readOnly: true,
  fields: [
    defineField({
      name: "code",
      title: "Code",
      description: "What the buyer and the business read out, e.g. K7Q2.",
      type: "string",
    }),
    partyField("buyer", "Buyer"),
    usernameKeyField("buyerKey", "Buyer (key)"),
    defineField({
      name: "placedBy",
      title: "Placed by",
      type: "string",
      options: {
        list: [
          { value: "buyer", title: "The buyer" },
          { value: "demo_bot", title: "Demo bot (simulated by a manager)" },
        ],
      },
    }),
    partyField("business", "Business"),
    usernameKeyField("businessKey", "Business (key)"),
    defineField({
      name: "category",
      title: "Category",
      type: "string",
      options: { list: [...BUSINESS_CATEGORIES] },
    }),
    defineField({
      name: "lines",
      title: "Items",
      description: "Names and prices as they were when the order was placed.",
      type: "array",
      of: [
        defineArrayMember({
          name: "orderLine",
          title: "Item",
          type: "object",
          fields: [
            defineField({
              name: "productId",
              title: "Product",
              type: "string",
            }),
            defineField({ name: "name", title: "Name", type: "string" }),
            centsField("unitPrice", "Unit price"),
            defineField({
              name: "quantity",
              title: "Quantity",
              type: "number",
            }),
          ],
          preview: {
            select: {
              name: "name",
              quantity: "quantity",
              unitPrice: "unitPrice",
            },
            prepare({ name, quantity, unitPrice }) {
              return {
                title: `${quantity ?? "?"} × ${name ?? "Item"}`,
                subtitle: formatCredits(unitPrice),
              };
            },
          },
        }),
      ],
    }),
    centsField("subtotal", "Subtotal"),
    centsField("deliveryFee", "Delivery fee"),
    centsField(
      "total",
      "Total",
      "What the buyer paid, in hundredths of a credit."
    ),
    defineField({
      name: "deliveryPlaceId",
      title: "Deliver to",
      type: "string",
      options: {
        list: PLACES.map(({ id, name }) => ({ value: id, title: name })),
      },
    }),
    defineField({ name: "note", title: "Note", type: "string" }),
    defineField({
      name: "sourceTweetId",
      title: "Ordered from Tweet",
      description: "The Tweet whose product card the order started from.",
      type: "string",
    }),
    timestampField("placedAt", "Placed"),
    timestampField("acceptAt", "Accepted at"),
    timestampField("onTheWayAt", "On the way at"),
    defineField({
      ...timestampField("deliverAt", "Delivered at"),
      description:
        "The payment is held for the business until then, so a cancellation before it is refunded in full.",
    }),
    timestampField("cancelledAt", "Cancelled"),
    defineField({
      name: "cancelledBy",
      title: "Cancelled by",
      type: "string",
      options: { list: ["buyer", "business"] },
    }),
    defineField({
      name: "paymentTransferId",
      title: "Payment",
      description: "The id of the transfer that paid it.",
      type: "string",
    }),
    defineField({
      name: "refundTransferId",
      title: "Refund",
      description: "The id of the refund, once cancelled.",
      type: "string",
    }),
    requestHashField,
  ],
  orderings: [
    {
      title: "Newest first",
      name: "placedAtDesc",
      by: [{ field: "placedAt", direction: "desc" }],
    },
  ],
  preview: {
    select: {
      code: "code",
      total: "total",
      buyer: "buyer.username",
      business: "business.username",
      cancelledAt: "cancelledAt",
    },
    prepare({ code, total, buyer, business, cancelledAt }) {
      return {
        title: `#${code ?? "????"} · ${formatCredits(total)}${cancelledAt ? " · cancelled" : ""}`,
        subtitle: `@${buyer ?? "unknown"} → @${business ?? "unknown"}`,
      };
    },
  },
});

export const types = [orderType];

/** The "Food" group's entry after Products. */
export function structureItems(S: StructureBuilder) {
  return [
    S.listItem()
      .title("Orders")
      .schemaType("order")
      .child(
        S.documentTypeList("order")
          .title("Orders")
          .defaultOrdering([{ field: "placedAt", direction: "desc" }])
      ),
  ];
}

export const APP_CREATED_TYPES = ["order"];
export const LOCKED_TYPES = ["order"];
export const MODERATED_TYPES: string[] = [];
