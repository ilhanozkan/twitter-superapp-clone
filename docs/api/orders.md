# Orders API

Anyone can order from a business's menu (or straight from a product card on
a Tweet) and pay with demo credits. The payment reaches the business at
once but is **held** until the order is delivered, so a cancellation before
then is always refunded in full. Orders move through their stages by
themselves: there is no background job, every read derives the status from
the stored schedule and the server's clock.

These endpoints belong to the `orders` feature. They follow the
[SuperApp conventions](../API.md#superapp-conventions): amounts are integer
cents (`650` is 6.50 credits), placing an order needs an `Idempotency-Key`,
orders you neither bought nor run answer 404, and every response carries
`serverNow`.

| Method & path                                | Request                                                                                                                           | Success                                         |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `POST /api/orders`                           | key; `{ business, items: [{ productId, quantity: 1..20 }] (1..10), deliveryPlaceId, note?: ≤140, expectedTotal, sourceTweetId? }` | `201 { order, wallet, serverNow }` + `Location` |
| `GET /api/orders`                            | `?as=buyer or business&business=&state=active or past&limit=1..50&cursor=`                                                        | `200 { items, nextCursor, serverNow }`          |
| `GET /api/orders/:id`                        | —                                                                                                                                 | `200 { order, serverNow }`                      |
| `POST /api/orders/:id/cancel`                | `{ "as": "buyer" or "business" }`                                                                                                 | `200 { order, wallet, serverNow }` (idempotent) |
| `POST /api/businesses/:username/demo-orders` | key; no body                                                                                                                      | `201 { order, serverNow }` + `Location`         |
| `GET /api/businesses/:username/summary`      | `?since=ISO`                                                                                                                      | `200 { summary, wallet, since, serverNow }`     |

"key" means the `Idempotency-Key` header is required. Response types are in
`types/Order.ts`, next to the objects. The browser calls these through
`lib/client/ordersApi.ts`.

## Objects

### Order

```json
{
  "id": "seed-o01",
  "code": "K7Q2",
  "buyer": {
    "username": "illlhanozkan",
    "fullname": "Ilhan Ozkan",
    "image": "/avatars/illlhanozkan.svg"
  },
  "placedBy": "buyer",
  "business": {
    "username": "kizilaykahve",
    "fullname": "Kızılay Kahve",
    "image": "/avatars/kizilaykahve.svg",
    "category": "cafe"
  },
  "lines": [
    {
      "productId": "seed-p-kk-latte",
      "name": "Pistachio latte",
      "unitPrice": 500,
      "quantity": 1,
      "total": 500
    },
    {
      "productId": "seed-p-kk-simit",
      "name": "Simit",
      "unitPrice": 250,
      "quantity": 1,
      "total": 250
    }
  ],
  "subtotal": 750,
  "deliveryFee": 150,
  "total": 900,
  "deliveryPlace": {
    "id": "tunali",
    "name": "Tunalı Hilmi",
    "area": "Kavaklıdere",
    "lat": 39.9067,
    "lng": 32.8607
  },
  "note": null,
  "sourceTweetId": null,
  "placedAt": "2026-10-07T11:00:00.000Z",
  "acceptAt": "2026-10-07T11:01:00.000Z",
  "onTheWayAt": "2026-10-07T11:04:00.000Z",
  "deliverAt": "2026-10-07T11:10:00.000Z",
  "cancelledAt": null,
  "cancelledBy": null,
  "paymentTransferId": "seed-tx-o01",
  "refundTransferId": null,
  "status": "delivered",
  "stages": [
    {
      "status": "placed",
      "label": "Placed",
      "at": "2026-10-07T11:00:00.000Z",
      "reached": true
    },
    {
      "status": "accepted",
      "label": "Accepted",
      "at": "2026-10-07T11:01:00.000Z",
      "reached": true
    },
    {
      "status": "on_the_way",
      "label": "On the way",
      "at": "2026-10-07T11:04:00.000Z",
      "reached": true
    },
    {
      "status": "delivered",
      "label": "Delivered",
      "at": "2026-10-07T11:10:00.000Z",
      "reached": true
    }
  ],
  "eta": null,
  "nextChangeAt": null,
  "canCancel": { "buyer": false, "business": false }
}
```

- `code` is what people read out. It is for display only; `id` is the key.
- `lines` keep the names and prices of the moment the order was placed:
  later menu changes never touch an order.
- `placedBy` is `demo_bot` for orders simulated by a business's managers.
- `sourceTweetId` is the Tweet whose product card the order started from.
- **Stored schedule:** `placedAt`, `acceptAt`, `onTheWayAt`, `deliverAt`
  (and `cancelledAt` once cancelled). They are absolute times set when the
  order is placed, so they never change speed afterwards.
- **Derived at `serverNow`:**
  - `status` is the latest stage reached: `placed`, `accepted`,
    `on_the_way`, `delivered`, or `cancelled`.
  - `stages` lists the four stages with their times. A cancellation ends
    them: later stages are left out and `cancelled` comes last.
  - `eta` is `deliverAt` while the order is on its way, else `null`.
  - `nextChangeAt` is when the status changes next (poll then), else
    `null`.
  - `canCancel.buyer` is true until `acceptAt`, `canCancel.business` until
    `deliverAt`. Both are false once cancelled.

Between polls, clients re-derive the same fields with `orderAt(order, now)`
from `lib/superapp/orders.ts` on the server's clock
(`useServerClock(serverNow)`).

### The schedule

| Stage        | When                                                   |
| ------------ | ------------------------------------------------------ |
| `accepted`   | `placedAt` + max(60 s ÷ scale, 15 s)                   |
| `on_the_way` | `acceptAt` + the business's prep minutes ÷ scale       |
| `delivered`  | `onTheWayAt` + the business's delivery minutes ÷ scale |

`scale` is `SUPERAPP_TIME_SCALE` (1 by default; the e2e suite uses 60) when
the order is placed. Whatever the scale, the buyer always has at least 15
real seconds to cancel. Kızılay Kahve (3 minutes' prep, 6 minutes'
delivery) delivers 10 minutes after an order at scale 1, and 24 seconds
after one at scale 60.

### Price

The total comes from `priceOrder` in `lib/superapp/orders.ts`, the same
function checkout runs in the browser:

- each line costs `unitPrice × quantity`, and the `subtotal` is their sum;
- `total` is `subtotal + deliveryFee` (the business's fee);
- the business's `minimumOrder` applies to the subtotal (the fee doesn't
  count towards it);
- a total is at most 200.00 credits.

Everything is whole cents, so nothing is ever rounded.

### Payment and refund

Placing an order writes the order and its payment in one commit. The
payment is a transfer of `kind: "order"` from the buyer to the business,
with id `<order id>-1`, `context: { "type": "order", id, code }` and
`holdUntil: deliverAt`. Until then the credits are `pending` in the
business's wallet: part of its balance, but not spendable.

Cancelling writes the refund `refund-<payment id>` (`kind: "order_refund"`),
which reverses the held payment. Held credits can't be spent, so the refund
never fails: not even after the business spent everything it could, and
not when either wallet is frozen. A payment is refunded at most once.

## Placing an order

### `POST /api/orders`

The buyer is always the current user; `business` is the business's
username. Price the cart with `priceOrder` and send its `total` as
`expectedTotal`: if the server's total differs (a price or fee changed),
nothing is charged and the answer is 409 `price_changed`.

```sh
curl -X POST http://localhost:3000/api/orders \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: 0b8b8a3c-6b51-4d19-9f3a-6a9e8c1f2d10' \
  -d '{
    "business": "kizilaykahve",
    "items": [{ "productId": "seed-p-kk-latte", "quantity": 1 }],
    "deliveryPlaceId": "tunali",
    "note": "Oat milk, please",
    "expectedTotal": 650,
    "sourceTweetId": "seed-t22"
  }'
```

The answer has the order, the buyer's `wallet` afterwards and `Location:
/api/orders/<id>`. Retrying with the same key returns the same order with
`Idempotent-Replayed: true` and charges nothing again.

- `items` lists each product once, 1 to 10 of them, with a quantity of 1
  to 20.
- `deliveryPlaceId` is one of the places from `GET /api/places`.
- `note` is up to 140 characters, sanitized like Tweet text; blank is
  `null`.
- `sourceTweetId` is kept only if that Tweet still exists.
- Fields naming anyone else (`buyer`, `from`, `username`, `placedBy`…) are
  ignored.

| Status | `code`                   | When                                                                                       |
| ------ | ------------------------ | ------------------------------------------------------------------------------------------ |
| 400    | `validation_error`       | Bad body or key; `business` is your own account ("You can't order from your own business") |
| 402    | `insufficient_funds`     | Your available credits don't cover the total                                               |
| 403    | `wallet_frozen`          | Your wallet is frozen                                                                      |
| 404    | `not_found`              | No such business                                                                           |
| 409    | `price_changed`          | `expectedTotal` isn't the current total: "Prices changed. Review your order."              |
| 409    | `conflict`               | Busy (concurrent writes on Sanity); retry with the same key                                |
| 422    | `unavailable`            | The business can't take orders now, items are sold out or gone, or below the minimum       |
| 422    | `limit_exceeded`         | Over 200.00, or you already have 5 orders in progress                                      |
| 422    | `idempotency_key_reused` | The key was used for a different order                                                     |
| 429    | `rate_limited`           | More than 12 money operations in a minute (shared with the wallet)                         |

A 422 `unavailable` says why in its message and names the products at fault
in `details`, so checkout can mark those lines:

```json
{
  "error": {
    "code": "unavailable",
    "message": "Simit is sold out",
    "details": [{ "path": "productId", "message": "seed-p-kk-simit" }],
    "requestId": "…"
  }
}
```

| Message                                                 | Why                                              |
| ------------------------------------------------------- | ------------------------------------------------ |
| "Lahmacun Lab is closed · Opens 11:00"                  | Outside its opening hours                        |
| "Kızılay Kahve isn't taking orders right now"           | Its managers paused orders                       |
| "Kızılay Kahve can't take orders right now"             | Its wallet is frozen                             |
| "Simit is sold out", "This item is no longer available" | One line (`details` names it)                    |
| "Some items are sold out or no longer available"        | Several lines (`details` names them)             |
| "The minimum order at Kızılay Kahve is 3.00 credits"    | The subtotal is below the minimum (no `details`) |

You can have at most 5 orders in progress (neither delivered nor
cancelled) at a time; the count is exact even for simultaneous requests.
Managers may order from the businesses they run, but a business account
can't order from itself.

## Reading orders

### `GET /api/orders`

Newest first by `placedAt`, paged like the timeline: pass `nextCursor` back
as `cursor` until it is `null`.

- `as=buyer` (the default): your own orders. `business=` narrows them to one
  business.
- `as=business&business=<username>`: that business's orders, for the people
  who run it (the account itself and its managers). Anyone else gets 404
  "Business not found".
- `state=active` keeps orders in progress; `state=past` keeps delivered and
  cancelled ones.

### `GET /api/orders/:id`

The order, for its buyer and the people who run its business. Everyone
else gets 404 "Order not found", the same as for an id that doesn't exist.

## Cancelling

### `POST /api/orders/:id/cancel`

`{ "as": "buyer" }` cancels your own order before the business accepts it
(at least 15 seconds). `{ "as": "business" }` lets the people who run the
business cancel it any time before delivery. Either way the buyer gets a
full refund. It takes no key: cancelling an order that is already cancelled
(by either side) answers 200 with the order as it is. `wallet` is the
current user's wallet afterwards.

| Status | `code`             | When                                                                            |
| ------ | ------------------ | ------------------------------------------------------------------------------- |
| 400    | `validation_error` | `as` is missing, or not `buyer` or `business`                                   |
| 403    | `forbidden`        | You can see the order but can't cancel it that way (e.g. the buyer as business) |
| 404    | `not_found`        | No such order, or you neither bought it nor run its business                    |
| 409    | `invalid_state`    | Too late: already accepted (for the buyer), or delivered                        |
| 409    | `conflict`         | Busy (concurrent writes on Sanity); try again                                   |

When the business cancels, the buyer gets an `order` notification
(`event: "cancelled"`).

## Business tools

Both endpoints are for the people who run the business (404 for everyone
else).

### `POST /api/businesses/:username/demo-orders`

"Simulate a customer order · Demo bot": the demo customer
(`@demo_customer`, labelled Demo bot) orders 1 or 2 available products,
chosen from the key, to somewhere in the city. In the same commit the app
issues exactly the total to the demo customer (an `issue` transfer with the
note "Demo bot funding", id `<order id>-2`) and the demo customer pays it,
so no real account's credits are involved. The order then behaves like any
other: held payment, stages, cancel and refund.

It needs a key (no body) and is limited to 5 an hour per user (429 with
`Retry-After`). A business that can't take orders, or has nothing
available, answers 422 `unavailable`.

### `GET /api/businesses/:username/summary`

The Business board's header: the business's orders since `since` (default:
midnight today in the business's time zone), and its wallet.

```json
{
  "summary": { "orders": 4, "revenue": 6300, "pending": 1500, "fromTweets": 1 },
  "wallet": {
    "username": "superapp",
    "balance": 6300,
    "pending": 1500,
    "available": 4800,
    "frozen": false
  },
  "since": "2026-10-07T21:00:00.000Z",
  "serverNow": "2026-10-08T12:00:00.000Z"
}
```

Cancelled orders don't count; `pending` is the total of those not delivered
yet; `fromTweets` counts orders placed from a Tweet's product card.

## Notifications and live activity

Order notifications are derived on every read and never stored, so their
ids are stable:

| Event       | Who                                                      | When          | Id                     | `actor`      |
| ----------- | -------------------------------------------------------- | ------------- | ---------------------- | ------------ |
| `received`  | The business and its managers (not for their own orders) | `placedAt`    | `order-received-<id>`  | The buyer    |
| `delivered` | The buyer, once `deliverAt` has passed                   | `deliverAt`   | `order-delivered-<id>` | The business |
| `cancelled` | The buyer, when the business cancelled                   | `cancelledAt` | `order-cancelled-<id>` | The business |

Each carries `orderId`, `code` and `business` (the business's name).

`GET /api/activity` lists the current user's orders in progress as live
activity: `{ kind: "order", title: "Order from Kızılay Kahve", status:
"On the way", eta, href: "/orders/<id>", nextChangeAt }`.

While orders are on, products from your delivered orders join the
composer's suggestions (`GET /api/products/attachable`), after those of the
businesses you run.

## Turned off

With `orders` in `DISABLED_FEATURES` every endpoint here answers 404 "This
feature is turned off", `GET /api/me` reports `"orders": false`, and order
notifications and live activity disappear. On Sanity orders are private
documents: without `SANITY_API_TOKEN` the endpoints answer 503 "Orders
needs SANITY_API_TOKEN on this deployment".

## Demo data

| Order      | Code   | Buyer → business           | Items                  | Total | State                              |
| ---------- | ------ | -------------------------- | ---------------------- | ----- | ---------------------------------- |
| `seed-o01` | `K7Q2` | demo user → `kizilaykahve` | Pistachio latte, Simit | 9.00  | Delivered yesterday                |
| `seed-o02` | `P4R8` | `sarahcodes` → `superapp`  | Sticker pack           | 6.00  | Delivered 2 days ago               |
| `seed-o03` | `M2X9` | `devmarco` → `superapp`    | SuperApp mug           | 15.00 | On its way (placed 40 minutes ago) |

Their payments are `seed-tx-o01` to `seed-tx-o03`; `seed-o03`'s is still
held for `@superapp`. The demo user manages `@superapp`, so `seed-o02` and
`seed-o03` are on its board.
