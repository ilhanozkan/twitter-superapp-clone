# Wallet API

Every account has a wallet of **demo credits**. They have no cash value and
can't be bought, withdrawn or exchanged: you add them for free (a few times a
day), then tip Tweets, pay people and ask them to pay you. Orders and rides
pay with them too.

These endpoints belong to the `wallet` feature. They follow the
[SuperApp conventions](../API.md#superapp-conventions): amounts are integer
cents (`1250` is 12.50 credits), money-moving `POST`s need an
`Idempotency-Key`, money operations share a per-user budget of 12 a minute,
and records you are not a party to answer 404.

| Method & path                           | Request                                                         | Success                                        |
| --------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------- |
| `GET /api/wallet`                       | —                                                               | `200 { wallet, limits, serverNow }`            |
| `GET /api/wallet/activity`              | `?limit=1..50&cursor=`                                          | `200 { items, nextCursor }`                    |
| `GET /api/wallet/transfers/:id`         | —                                                               | `200 { transfer }`                             |
| `POST /api/wallet/transfers`            | key; `{ "to": username, "amount": 50..20000, "note"?: ≤100 }`   | `201 { transfer, wallet }` + `Location`        |
| `POST /api/wallet/top-ups`              | key; `{ "amount": 2500, 5000 or 10000 }`                        | `201 { transfer, wallet }` + `Location`        |
| `GET /api/wallet/requests`              | `?role=incoming or outgoing&status=`                            | `200 { items }`                                |
| `POST /api/wallet/requests`             | key; `{ "from": username, "amount": 50..20000, "note"?: ≤100 }` | `201 { request }` + `Location`                 |
| `GET /api/wallet/requests/:id`          | —                                                               | `200 { request }`                              |
| `POST /api/wallet/requests/:id/pay`     | key; no body                                                    | `200 { request, transfer, wallet }`            |
| `POST /api/wallet/requests/:id/decline` | no body                                                         | `200 { request }`                              |
| `POST /api/wallet/requests/:id/cancel`  | no body                                                         | `200 { request }`                              |
| `POST /api/tweets/:id/tip`              | key; `{ "amount": 50..5000, "note"?: ≤100 }`                    | `201 { transfer, wallet, tweet }` + `Location` |
| `GET /api/users`                        | `?q=1..50 characters&limit=1..20`                               | `200 { items }`                                |

"key" means the `Idempotency-Key` header is required. Response types are in
`types/Api.ts`; the objects are in `types/Wallet.ts`.

## Objects

### Wallet

```json
{
  "username": "illlhanozkan",
  "balance": 32500,
  "pending": 1500,
  "available": 31000,
  "frozen": false
}
```

- `balance` is everything in the wallet.
- `pending` is credits received for orders and rides that can still be
  refunded. They become available by themselves when the order is delivered
  or the ride picks you up.
- `available` (`balance - pending`) is what you can spend.
- `frozen`: a moderator froze the wallet. It can't send or receive credits;
  refunds still reach it.

A user who never received credits has a wallet of 0. Reading it never
creates anything.

### Transfer

Every movement of credits is one immutable transfer, from a wallet (or
`null`: credits issued by the app) to a wallet.

```json
{
  "id": "seed-tx03",
  "kind": "payment",
  "amount": 1500,
  "from": {
    "username": "devmarco",
    "fullname": "Marco Rossi",
    "image": "/avatars/devmarco.svg"
  },
  "to": {
    "username": "illlhanozkan",
    "fullname": "Ilhan Ozkan",
    "image": "/avatars/illlhanozkan.svg"
  },
  "note": "Thanks for the code review 🙏",
  "context": { "type": "conversation", "id": "dm-devmarco-illlhanozkan" },
  "createdAt": "2026-10-09T09:30:00.000Z",
  "holdUntil": null,
  "reversedBy": null,
  "reverses": null
}
```

| Field        | Meaning                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| `kind`       | `issue` (added credits), `payment`, `tip`, `request` (a paid request), `order`, `order_refund`, `ride`, `ride_refund` |
| `context`    | What it was for: `{ type: "tweet" \| "conversation" \| "request", id }` or `{ type: "order" \| "ride", id, code }`    |
| `holdUntil`  | On order and ride payments: the credit is pending for the recipient, and refundable, until then                       |
| `reversedBy` | On a refunded payment: the refund's id                                                                                |
| `reverses`   | On a refund: the payment it reverses                                                                                  |

A tip's `context.id` stays even after the Tweet is deleted: tips are never
deleted.

### Payment request

```json
{
  "id": "seed-req01",
  "requester": {
    "username": "sarahcodes",
    "fullname": "Sarah Chen",
    "image": "/avatars/sarahcodes.svg"
  },
  "payer": {
    "username": "illlhanozkan",
    "fullname": "Ilhan Ozkan",
    "image": "/avatars/illlhanozkan.svg"
  },
  "amount": 450,
  "note": "Coffee ☕",
  "status": "pending",
  "createdAt": "2026-10-09T07:30:00.000Z",
  "expiresAt": "2026-10-16T07:30:00.000Z",
  "respondedAt": null,
  "transferId": null,
  "conversationId": "dm-illlhanozkan-sarahcodes"
}
```

The `requester` gets paid; the `payer` is asked to pay. `status` is one of:

| Status      | Meaning                                                                |
| ----------- | ---------------------------------------------------------------------- |
| `pending`   | Waiting for the payer, for up to 7 days                                |
| `paid`      | Paid; `transferId` is the payment and `respondedAt` when it happened   |
| `declined`  | The payer said no                                                      |
| `cancelled` | The requester withdrew it                                              |
| `expired`   | Still pending after `expiresAt` (derived from the clock, never stored) |

### Limits

`GET /api/wallet` returns what the current user may do right now:

```json
{
  "minPayment": 50,
  "maxPayment": 20000,
  "minTip": 50,
  "maxTip": 5000,
  "tipPresets": [100, 200, 500, 1000],
  "topUpAmounts": [2500, 5000, 10000],
  "topUpCap": 100000,
  "topUpsPerDay": 3,
  "topUpsLeftToday": 2,
  "pendingRequestsLeft": 9
}
```

- Payments and requests are 0.50–200.00 credits; tips 0.50–50.00.
- Top-ups add 25.00, 50.00 or 100.00, at most 3 times in any 24 hours, and
  never past a balance of 1,000.00.
- You can have at most 10 pending requests of your own.
- Notes are up to 100 characters, sanitized like Tweet text; a blank note is
  stored as `null`.

## Reading

### `GET /api/wallet`

The current user's wallet and limits, with `serverNow`: pending credits turn
available as time passes, so clients compare against the server's clock.

### `GET /api/wallet/activity`

Transfers from or to the current user, newest first, paged like the
timeline: pass `nextCursor` back as `cursor` until it is `null`. `limit` is
1–50 (default 20).

### `GET /api/wallet/transfers/:id`

A receipt. Only its two parties can read it; for anyone else, and for ids
that don't exist, the answer is 404.

### `GET /api/wallet/requests`

`role=incoming` lists requests asking the current user to pay;
`role=outgoing` lists the ones they sent. `status` filters by status
(`expired` included). Newest first, at most 100.

### `GET /api/wallet/requests/:id`

One request, for its requester and payer only (404 for everyone else).

## Moving credits

Every request below needs an `Idempotency-Key` header and returns the
current user's `wallet` after the operation, so clients never guess a
balance. Retrying with the same key returns the original response with
`Idempotent-Replayed: true` and moves nothing again.

```sh
curl -X POST http://localhost:3000/api/wallet/transfers \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: 6f1d2a7e-0c51-4b8e-9b0e-3d3c5c1f9a42' \
  -d '{ "to": "sarahcodes", "amount": 1000, "note": "Pizza 🍕" }'
```

### `POST /api/wallet/transfers`

Sends credits to `to`. The response's `Location` is the receipt.

| Status | `code`                   | When                                                        |
| ------ | ------------------------ | ----------------------------------------------------------- |
| 400    | `validation_error`       | Bad `to`, `amount`, `note` or key; `to` is yourself         |
| 402    | `insufficient_funds`     | Your available credits don't cover it                       |
| 403    | `wallet_frozen`          | Your wallet or the recipient's is frozen                    |
| 404    | `not_found`              | No such user                                                |
| 409    | `conflict`               | Busy (concurrent writes on Sanity); retry with the same key |
| 422    | `idempotency_key_reused` | The key was used for a different request                    |
| 422    | `limit_exceeded`         | The demo store is full                                      |
| 429    | `rate_limited`           | More than 12 money operations in a minute                   |

### `POST /api/wallet/top-ups`

Adds free demo credits: `amount` is 2500, 5000 or 10000 (anything else is a
400). A fourth top-up within 24 hours, or one that would take the balance
past 1,000.00, is a 422 `limit_exceeded`; a frozen wallet gets 403
`wallet_frozen`.

### `POST /api/tweets/:id/tip`

Tips the Tweet's author. The response includes the Tweet, with
`stats.tips` and `viewer.tipped` updated. The author gets a `tip`
notification with the amount; everyone else only sees the count.

| Status | `code`                   | When                                       |
| ------ | ------------------------ | ------------------------------------------ |
| 400    | `validation_error`       | `amount` outside 50..5000, bad note or key |
| 402    | `insufficient_funds`     | Your available credits don't cover it      |
| 403    | `forbidden`              | "You can't tip your own Tweet"             |
| 403    | `wallet_frozen`          | Your wallet or the author's is frozen      |
| 404    | `not_found`              | No such Tweet, or it was moderated         |
| 422    | `idempotency_key_reused` | The key was used for a different request   |

## Payment requests

### `POST /api/wallet/requests`

Asks `from` to pay the current user. The payer gets a `payment_request`
notification; when they pay or decline, the requester gets
`request_paid` or `request_declined`.

| Status | `code`                   | When                                                    |
| ------ | ------------------------ | ------------------------------------------------------- |
| 400    | `validation_error`       | Bad `from`, `amount`, `note` or key; `from` is yourself |
| 403    | `wallet_frozen`          | Your wallet or the payer's is frozen                    |
| 404    | `not_found`              | No such user                                            |
| 422    | `limit_exceeded`         | You already have 10 pending requests                    |
| 422    | `idempotency_key_reused` | The key was used for a different request                |

### `POST /api/wallet/requests/:id/pay`

The payer pays the request (key required, no body). It answers 200 with the
request, now `paid`, the payment and the payer's wallet.

- 402 `insufficient_funds` when the payer's available credits don't cover it.
- 403 `forbidden` when the requester tries to pay their own request; 403
  `wallet_frozen` when either wallet is frozen.
- 404 for anyone who is not a party, and for unknown ids.
- 409 `invalid_state` once the request is paid, declined, cancelled or
  expired.

### `POST /api/wallet/requests/:id/decline` and `/cancel`

The payer declines; the requester cancels. They take no key and no body: the
same action again answers 200 with the request as it is. The other party
gets 403, anyone else 404, and a request already in another final state
(paid, expired, or closed the other way) gets 409 `invalid_state`.

## Finding people

### `GET /api/users`

People whose username or full name matches every word of `q` (each word must
start a word of the same field, as in Tweet search), sorted by username, at
most `limit` (1–20, default 10). The send dialog's recipient picker uses it.

```json
{
  "items": [
    {
      "username": "sarahcodes",
      "fullname": "Sarah Chen",
      "image": "/avatars/sarahcodes.svg",
      "accountType": "personal",
      "…": "the rest of the profile"
    }
  ]
}
```

## Moderation

On Sanity, a moderator freezes a wallet by creating a `walletFreeze`
document (with the `username` and an optional reason) and unfreezes it by
deleting that document. Wallet documents themselves are never edited by
hand: the app is the only writer of balances. A freeze is checked when each
operation starts, so one already in flight can still complete. Refunds
always go through, to and from frozen wallets.
