import { defineField, defineType, getPublishedId } from "sanity";
import type { StructureBuilder } from "sanity/structure";

import {
  apiVersion,
  STORED_REQUEST_STATUSES,
  TRANSFER_CONTEXT_TYPES,
  TRANSFER_KINDS,
} from "../env";
import {
  centsField,
  formatCredits,
  newestFirst,
  partyField,
  requestHashField,
  timestampField,
  usernameKeyField,
} from "./fields";
import { username } from "./rules";

// The demo-credit ledger (docs/SUPERAPP.md#ledger-and-holds). Wallets,
// transfers and payment requests are private documents ("private." ids)
// that only the app writes: the app checks every balance change against the
// transfers that justify it, in one transaction. Publishing a Studio draft
// of a wallet would overwrite a newer balance, so these types are locked and
// read-only. Moderators freeze a wallet with a separate walletFreeze
// document instead.

const walletType = defineType({
  name: "wallet",
  title: "Wallet",
  type: "document",
  readOnly: true,
  fields: [
    defineField({ name: "username", title: "Username", type: "string" }),
    usernameKeyField("key", "Key"),
    centsField(
      "balance",
      "Balance",
      "Hundredths of a credit: 450 is 4.50 credits. Changes only together with the transfers that explain it."
    ),
    timestampField("createdAt", "Created"),
    timestampField("updatedAt", "Updated"),
  ],
  orderings: [
    {
      title: "Recently updated",
      name: "updatedAtDesc",
      by: [{ field: "updatedAt", direction: "desc" }],
    },
  ],
  preview: {
    select: { username: "username", balance: "balance" },
    prepare({ username, balance }) {
      return {
        title: `@${username ?? "unknown"}`,
        subtitle: formatCredits(balance),
      };
    },
  },
});

const transferType = defineType({
  name: "transfer",
  title: "Transfer",
  type: "document",
  readOnly: true,
  fields: [
    defineField({
      name: "kind",
      title: "Kind",
      type: "string",
      options: { list: [...TRANSFER_KINDS] },
    }),
    centsField("amount", "Amount"),
    partyField("from", "From", "Empty for demo credits issued by SuperApp."),
    usernameKeyField("fromKey", "From (key)"),
    partyField("to", "To"),
    usernameKeyField("toKey", "To (key)"),
    defineField({ name: "note", title: "Note", type: "string" }),
    defineField({
      name: "context",
      title: "Context",
      description: "What the transfer was for, such as a Tweet or an order.",
      type: "object",
      fields: [
        defineField({
          name: "type",
          title: "Type",
          type: "string",
          options: { list: [...TRANSFER_CONTEXT_TYPES] },
        }),
        defineField({ name: "id", title: "Id", type: "string" }),
        defineField({ name: "code", title: "Code", type: "string" }),
      ],
    }),
    defineField({
      name: "holdUntil",
      title: "Held until",
      description:
        "A held credit is pending (not spendable) until then, and can only be refunded before it.",
      type: "datetime",
    }),
    defineField({
      name: "reversedBy",
      title: "Refunded by",
      description: "The id of the refund transfer, set once.",
      type: "string",
    }),
    defineField({
      name: "reverses",
      title: "Refund of",
      description: "On a refund: the id of the transfer it reverses.",
      type: "string",
    }),
    timestampField("createdAt", "Created"),
    requestHashField,
  ],
  orderings: [newestFirst],
  preview: {
    select: {
      kind: "kind",
      amount: "amount",
      from: "from.username",
      to: "to.username",
    },
    prepare({ kind, amount, from, to }) {
      return {
        title: `${formatCredits(amount)} · ${kind ?? "transfer"}`,
        subtitle: `${from ? `@${from}` : "SuperApp"} → @${to ?? "unknown"}`,
      };
    },
  },
});

const paymentRequestType = defineType({
  name: "paymentRequest",
  title: "Payment request",
  type: "document",
  readOnly: true,
  fields: [
    partyField("requester", "Requester", "Gets paid."),
    usernameKeyField("requesterKey", "Requester (key)"),
    partyField("payer", "Payer", "Is asked to pay."),
    usernameKeyField("payerKey", "Payer (key)"),
    centsField("amount", "Amount"),
    defineField({ name: "note", title: "Note", type: "string" }),
    defineField({
      name: "status",
      title: "Status",
      description:
        "A pending request past its expiry reads as expired in the app.",
      type: "string",
      options: { list: [...STORED_REQUEST_STATUSES] },
    }),
    timestampField("createdAt", "Created"),
    timestampField("expiresAt", "Expires"),
    timestampField("respondedAt", "Responded"),
    defineField({
      name: "transferId",
      title: "Payment",
      description: "The id of the transfer that paid it.",
      type: "string",
    }),
    defineField({
      name: "conversationId",
      title: "Conversation",
      description: "Set when the request was made in a conversation.",
      type: "string",
    }),
    requestHashField,
  ],
  orderings: [newestFirst],
  preview: {
    select: {
      amount: "amount",
      status: "status",
      requester: "requester.username",
      payer: "payer.username",
    },
    prepare({ amount, status, requester, payer }) {
      return {
        title: `${formatCredits(amount)} · ${status ?? "pending"}`,
        subtitle: `@${requester ?? "unknown"} asks @${payer ?? "unknown"}`,
      };
    },
  },
});

// A freeze stops a wallet from sending or receiving (refunds still go
// through). It is its own document so moderators never touch a wallet, and
// live-edited so it takes effect the moment it is created; deleting it
// unfreezes the wallet.
const walletFreezeType = defineType({
  name: "walletFreeze",
  title: "Wallet freeze",
  type: "document",
  liveEdit: true,
  fields: [
    defineField({
      name: "username",
      title: "Username",
      description:
        "The account whose wallet is frozen (case-insensitive). Delete this document to unfreeze it.",
      type: "string",
      validation: (rule) => [
        username(rule),
        rule
          .custom(async (value, context) => {
            if (!value) return true;
            const published = getPublishedId(context.document?._id ?? "");
            const others = await context
              .getClient({ apiVersion })
              .fetch<string[]>(
                `*[_type == "walletFreeze" && lower(username) == $username]._id`,
                { username: value.toLowerCase() }
              );
            return others.some((id) => getPublishedId(id) !== published)
              ? "This wallet is already frozen: unfreezing it means deleting every freeze for it"
              : true;
          })
          .warning(),
      ],
    }),
    defineField({
      name: "reason",
      title: "Reason",
      description: "Visible to anyone who can read the dataset.",
      type: "text",
      rows: 2,
      validation: (rule) => rule.max(200),
    }),
    defineField({
      name: "createdAt",
      title: "Frozen at",
      type: "datetime",
      readOnly: true,
      initialValue: () => new Date().toISOString(),
    }),
  ],
  orderings: [newestFirst],
  preview: {
    select: { username: "username", reason: "reason" },
    prepare({ username, reason }) {
      return {
        title: `@${username ?? "unknown"}`,
        subtitle: reason || "Frozen",
      };
    },
  },
});

export const types = [
  walletType,
  transferType,
  paymentRequestType,
  walletFreezeType,
];

/** The "Money" group. */
export function structureItems(S: StructureBuilder) {
  const newest = (type: string, title: string, field = "createdAt") =>
    S.listItem()
      .title(title)
      .schemaType(type)
      .child(
        S.documentTypeList(type)
          .title(title)
          .defaultOrdering([{ field, direction: "desc" }])
      );

  return [
    newest("wallet", "Wallets", "updatedAt"),
    newest("walletFreeze", "Frozen wallets"),
    newest("transfer", "Transfers"),
    newest("paymentRequest", "Payment requests"),
  ];
}

export const APP_CREATED_TYPES = ["wallet", "transfer", "paymentRequest"];
export const LOCKED_TYPES = ["wallet", "transfer", "paymentRequest"];
export const MODERATED_TYPES: string[] = [];
