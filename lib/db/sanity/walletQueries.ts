import { PUBLISHED } from "./groq";

// GROQ for wallets, transfers and payment requests. Every query follows the
// SuperApp rules in ./groq: typed, PUBLISHED, `$now` from the app clock, and
// only validated integers interpolated.

const party = (field: string) =>
  `${field}{ "username": username, "fullname": coalesce(fullname, username), "image": image }`;

/** A transfer document as `transferFromRow` reads it; `id` is the private id. */
export const TRANSFER_FIELDS = `"id": _id, kind, amount, "from": ${party(
  "from"
)}, "to": ${party(
  "to"
)}, note, context, createdAt, holdUntil, reversedBy, reverses`;

/** A payment request document as `toPaymentRequest` reads it; `id` is the private id. */
export const REQUEST_FIELDS = `"id": _id, "requester": ${party(
  "requester"
)}, "payer": ${party(
  "payer"
)}, amount, note, status, createdAt, expiresAt, respondedAt, transferId, conversationId`;

/** Unreversed held credits at `$now` (the transfer's recipient has them pending). */
export const HELD = `defined(holdUntil) && dateTime(holdUntil) > dateTime($now) && !defined(reversedBy)`;

/** Pending requests `$key` has asked for (expiry derived from `$now`). */
export const PENDING_OUTGOING_COUNT = `count(*[_type == "paymentRequest" && requesterKey == $key && status == "pending" && dateTime(expiresAt) > dateTime($now) && ${PUBLISHED}])`;

/** Credits issued to `$key` since `$since`: the top-ups of the rolling day. */
export const TOP_UPS_COUNT = `count(*[_type == "transfer" && toKey == $key && kind == "issue" && !defined(fromKey) && dateTime(createdAt) > dateTime($since) && ${PUBLISHED}])`;

export const WALLET_QUERY = `{
  "balance": *[_type == "wallet" && key == $key && ${PUBLISHED}][0].balance,
  "held": *[_type == "transfer" && toKey == $key && ${HELD} && ${PUBLISHED}].amount,
  "frozen": count(*[_type == "walletFreeze" && lower(username) == $key && ${PUBLISHED}]) > 0
}`;

export const LIMITS_QUERY = `{
  "topUps": ${TOP_UPS_COUNT},
  "pendingOutgoing": ${PENDING_OUTGOING_COUNT}
}`;

const ACTIVITY_CURSOR =
  "(dateTime(createdAt) < dateTime($cursorCreatedAt) || " +
  "(dateTime(createdAt) == dateTime($cursorCreatedAt) && _id < $cursorId))";

/** Newest first by (createdAt, id), like the memory store; `fetchCount` is a validated integer. */
export const activityQuery = (cursor: boolean, fetchCount: number) =>
  `*[_type == "transfer" && (toKey == $key || fromKey == $key) && ${PUBLISHED}${
    cursor ? ` && ${ACTIVITY_CURSOR}` : ""
  }] | order(createdAt desc, _id desc) [0...${fetchCount}] { ${TRANSFER_FIELDS} }`;

export const TRANSFER_QUERY = `*[_type == "transfer" && _id == $id && ${PUBLISHED}][0]{ ${TRANSFER_FIELDS} }`;

export const REQUEST_QUERY = `*[_type == "paymentRequest" && _id == $id && ${PUBLISHED}][0]{ ${REQUEST_FIELDS}, _rev }`;

const REQUEST_STATUS: Record<string, string> = {
  pending: `status == "pending" && dateTime(expiresAt) > dateTime($now)`,
  expired: `status == "pending" && dateTime(expiresAt) <= dateTime($now)`,
};

/** `role` and `status` are validated enums; `limit` is a validated integer. */
export const requestsQuery = (
  role: "incoming" | "outgoing",
  status: string | undefined,
  limit: number
) =>
  `*[_type == "paymentRequest" && ${
    role === "incoming" ? "payerKey" : "requesterKey"
  } == $key${
    status ? ` && ${REQUEST_STATUS[status] ?? "status == $status"}` : ""
  } && ${PUBLISHED}] | order(createdAt desc, _id desc) [0...${limit}] { ${REQUEST_FIELDS} }`;

export const TIPS_QUERY = `*[_type == "transfer" && kind == "tip" && context.type == "tweet" && context.id in $ids && ${PUBLISHED}]{ "tweetId": context.id, "from": fromKey }`;

/** The recipient's tips and payments, the requests they were asked, and their answered requests. */
export const notificationsQuery = (limit: number) => `{
  "received": *[_type == "transfer" && toKey == $key && defined(fromKey) && (kind == "payment" || (kind == "tip" && context.type == "tweet")) && ${PUBLISHED}] | order(createdAt desc, _id desc) [0...${limit}] {
    ${TRANSFER_FIELDS},
    "tweet": *[_type == "tweet" && _id == ^.context.id && ^.context.type == "tweet" && blockTweet != true && ${PUBLISHED}][0]{ "id": _id, "text": coalesce(tweet, "") }
  },
  "asked": *[_type == "paymentRequest" && payerKey == $key && ${PUBLISHED}] | order(createdAt desc, _id desc) [0...${limit}] { ${REQUEST_FIELDS} },
  "answered": *[_type == "paymentRequest" && requesterKey == $key && status in ["paid", "declined"] && defined(respondedAt) && ${PUBLISHED}] | order(respondedAt desc, _id desc) [0...${limit}] { ${REQUEST_FIELDS} }
}`;

export const AUDIT_QUERY = `{
  "wallets": *[_type == "wallet" && ${PUBLISHED}]{ "username": key, balance },
  "transfers": *[_type == "transfer" && ${PUBLISHED}]{ ${TRANSFER_FIELDS} }
}`;
