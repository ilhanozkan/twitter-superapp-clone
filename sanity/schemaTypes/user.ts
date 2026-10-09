import { defineField, defineType, getPublishedId } from "sanity";

import { apiVersion } from "../env";
import { imageUrl, notReserved, username } from "./rules";

export const userType = defineType({
  name: "user",
  title: "User",
  type: "document",
  fields: [
    defineField({
      name: "username",
      title: "Username",
      description:
        "Handle without the @. Must be unique (case-insensitive) and can't be the name of an app page such as wallet or services.",
      type: "string",
      validation: (rule) => [
        notReserved(rule),
        username(rule).custom(async (value, context) => {
          if (!value) return true;

          // The same user may exist as published, draft and release versions;
          // only a different document counts as a clash.
          const published = getPublishedId(context.document?._id ?? "");
          const ids = await context
            .getClient({ apiVersion })
            .fetch<string[]>(
              `*[_type == "user" && lower(username) == $username]._id`,
              { username: value.toLowerCase() }
            );

          return ids.some((id) => getPublishedId(id) !== published)
            ? "This username is already taken"
            : true;
        }),
      ],
    }),
    defineField({
      name: "accountType",
      title: "Account type",
      description:
        "A business also needs a business profile (SuperApp → Food → Businesses), which adds its menu, hours and orders.",
      type: "string",
      options: {
        list: [
          { title: "Personal", value: "personal" },
          { title: "Business", value: "business" },
        ],
        layout: "radio",
        direction: "horizontal",
      },
      initialValue: "personal",
    }),
    defineField({
      name: "fullname",
      title: "Full name",
      type: "string",
      validation: (rule) => rule.required().max(50),
    }),
    defineField({
      name: "image",
      title: "Profile image",
      type: "url",
      validation: imageUrl,
    }),
    defineField({
      name: "banner",
      title: "Header image",
      type: "url",
      validation: imageUrl,
    }),
    defineField({
      name: "bio",
      title: "Bio",
      type: "text",
      rows: 3,
      validation: (rule) => rule.max(160),
    }),
    defineField({
      name: "location",
      title: "Location",
      type: "string",
      validation: (rule) => rule.max(30),
    }),
    defineField({
      name: "website",
      title: "Website",
      type: "url",
      validation: (rule) => rule.uri({ scheme: ["http", "https"] }),
    }),
    defineField({
      name: "verified",
      title: "Verified",
      type: "boolean",
      initialValue: false,
    }),
    defineField({
      name: "joinedAt",
      title: "Joined",
      description: "Defaults to when this document was created.",
      type: "datetime",
    }),
  ],
  preview: {
    select: {
      fullname: "fullname",
      username: "username",
      verified: "verified",
      accountType: "accountType",
    },
    prepare({ fullname, username, verified, accountType }) {
      return {
        title: `${fullname ?? username ?? "Unnamed user"}${
          verified ? " ✓" : ""
        }`,
        subtitle: username
          ? `@${username}${accountType === "business" ? " · Business" : ""}`
          : undefined,
      };
    },
  },
});
