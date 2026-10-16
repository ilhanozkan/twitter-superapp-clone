import { defineField, defineType } from "sanity";
import type { StructureBuilder } from "sanity/structure";

import { apiVersion, STUDIO_LIMITS } from "../env";
import { centsField, formatCredits } from "./fields";
import { imageUrl, maxLength, username } from "./rules";

const { product: limits } = STUDIO_LIMITS;

// Menu items. A product belongs to the business whose username it names
// (case-insensitively); the business's name, avatar and opening hours come
// from its account and profile. Products are live-edited: the app's
// availability switch patches the published document, which a later
// publish of an older Studio draft would otherwise overwrite. Every edit
// is therefore live at once; the app hides a product until it has a name,
// a section and a valid price.

const productType = defineType({
  name: "product",
  title: "Product",
  type: "document",
  liveEdit: true,
  fields: [
    defineField({
      name: "business",
      title: "Business",
      description:
        "The business's username. It needs a business profile, or the app hides the product.",
      type: "string",
      validation: (rule) => [
        username(rule),
        rule
          .custom(async (value, context) => {
            if (!value) return true;
            const profiles = await context
              .getClient({ apiVersion })
              .fetch<number>(
                `count(*[_type == "businessProfile" && lower(username) == $username])`,
                { username: value.toLowerCase() }
              );
            return profiles > 0
              ? true
              : "No business profile has this username, so the app hides the product";
          })
          .warning(),
      ],
    }),
    defineField({
      name: "section",
      title: "Section",
      description:
        'The menu heading it is listed under, such as "Coffee". Sections appear in the order of their first product.',
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "name",
      title: "Name",
      type: "string",
      validation: (rule) => maxLength(rule.required(), limits.nameMax),
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "text",
      rows: 2,
      validation: (rule) => maxLength(rule, limits.descriptionMax),
    }),
    defineField({
      ...centsField("price", "Price"),
      validation: (rule) =>
        rule.required().integer().min(limits.price.min).max(limits.price.max),
    }),
    defineField({
      name: "image",
      title: "Image",
      description:
        "An https URL, or a path on the app such as /media/menu/simit.svg.",
      type: "url",
      validation: imageUrl,
    }),
    defineField({
      name: "imageAlt",
      title: "Image description",
      description:
        "What the image shows, for people who can't see it. Required with an image.",
      type: "string",
      validation: (rule) =>
        maxLength(rule, limits.imageAltMax).custom((value, context) =>
          context.document?.image && !value?.trim()
            ? "Describe the image"
            : true
        ),
    }),
    defineField({
      name: "available",
      title: "Available",
      description:
        "Off shows it as sold out. The business's managers switch this in the app (Business → Menu).",
      type: "boolean",
      initialValue: true,
    }),
    defineField({
      name: "position",
      title: "Position",
      description: "Its place on the menu: lower numbers come first.",
      type: "number",
      initialValue: 0,
      validation: (rule) => rule.required().integer().min(0),
    }),
  ],
  orderings: [
    {
      title: "Menu order",
      name: "menuOrder",
      by: [
        { field: "business", direction: "asc" },
        { field: "position", direction: "asc" },
      ],
    },
  ],
  preview: {
    select: {
      name: "name",
      business: "business",
      section: "section",
      price: "price",
      available: "available",
    },
    prepare({ name, business, section, price, available }) {
      return {
        title: name ?? "Untitled product",
        subtitle: [
          `@${business ?? "unknown"}`,
          section,
          formatCredits(price),
          available === false ? "sold out" : null,
        ]
          .filter(Boolean)
          .join(" · "),
      };
    },
  },
});

export const types = [productType];

/** The "Food" group's entry after Businesses. */
export function structureItems(S: StructureBuilder) {
  return [S.documentTypeListItem("product").title("Products")];
}

export const APP_CREATED_TYPES: string[] = [];
export const LOCKED_TYPES: string[] = [];
export const MODERATED_TYPES: string[] = [];
