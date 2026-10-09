import { defineField } from "sanity";

import { imageUrl } from "./rules";

// Field shapes the SuperApp documents share. They describe what the app
// writes (lib/db/sanity/*Documents.ts), so app-created records validate.

/** A person as the app snapshots them on a record: `{ username, fullname, image }`. */
export function partyField(name: string, title: string, description?: string) {
  return defineField({
    name,
    title,
    description,
    type: "object",
    options: { collapsible: false },
    fields: [
      defineField({ name: "username", title: "Username", type: "string" }),
      defineField({ name: "fullname", title: "Full name", type: "string" }),
      defineField({
        name: "image",
        title: "Profile image",
        type: "url",
        validation: imageUrl,
      }),
    ],
  });
}

/** The lower-case username stored next to a party, so queries match it exactly. */
export function usernameKeyField(name: string, title: string) {
  return defineField({
    name,
    title,
    description: "The username in lower case, for queries.",
    type: "string",
  });
}

/** Demo credits as integer cents. */
export function centsField(name: string, title: string, description?: string) {
  return defineField({
    name,
    title,
    description: description ?? "Hundredths of a credit: 450 is 4.50 credits.",
    type: "number",
    validation: (rule) => rule.integer().min(0),
  });
}

/** An app-clock timestamp (records never use `_createdAt`). */
export function timestampField(name: string, title: string) {
  return defineField({ name, title, type: "datetime" });
}

/** The fingerprint that makes a retried request a replay; internal to the app. */
export const requestHashField = defineField({
  name: "requestHash",
  title: "Request fingerprint",
  type: "string",
  hidden: true,
});

/** "1,234.50 credits", like the app (no currency symbol: credits aren't money). */
export function formatCredits(cents: unknown): string {
  if (typeof cents !== "number") return "? credits";
  return `${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} credits`;
}

/** Newest first by the app's `createdAt`. */
export const newestFirst = {
  title: "Newest first",
  name: "createdAtDesc",
  by: [{ field: "createdAt", direction: "desc" as const }],
};
