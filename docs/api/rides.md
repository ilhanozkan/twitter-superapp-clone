# Rides API

Book a trip between two places in Ankara with a demo driver. The fare is
fixed upfront from the distance, paid in **demo credits** when you book, and
held for the driver until pickup, so cancelling before then refunds it in
full. Drivers, cars and times are simulated: nothing moves in the real
world, and demo trips are shorter than real ones.

These endpoints belong to the `rides` feature. They follow the
[SuperApp conventions](../API.md#superapp-conventions): amounts are integer
cents (`740` is 7.40 credits), booking and tipping need an
`Idempotency-Key`, both count against the per-user budget of 12 money
operations a minute, and rides you are not part of answer 404.

| Method & path                | Request                                   | Success                                        |
| ---------------------------- | ----------------------------------------- | ---------------------------------------------- |
| `GET /api/rides/quote`       | `?from=&to=` (place ids)                  | `200 { quotes, distanceKm, tripMinutes }`      |
| `POST /api/rides`            | key; `{ from, to, type, expectedFare }`   | `201 { ride, wallet, serverNow }` + `Location` |
| `GET /api/rides`             | `?as=rider or driver&limit=1..50&cursor=` | `200 { items, nextCursor, serverNow }`         |
| `GET /api/rides/:id`         | —                                         | `200 { ride, serverNow }`                      |
| `POST /api/rides/:id/cancel` | no body                                   | `200 { ride, wallet, serverNow }`              |
| `POST /api/rides/:id/tip`    | key; `{ "amount": 50..5000 }`             | `201 { transfer, wallet }` + `Location`        |

"key" means the `Idempotency-Key` header is required. Places are the ids of
`GET /api/places` (`kizilay`, `atakule`, …). Response types are in
`types/Ride.ts`.

## Fares and times

Prices depend only on the two places and the ride type, so a client can
show them before asking the server (`lib/superapp/rides.ts`):

| Type      | Base | Per km | Seats |
| --------- | ---- | ------ | ----- |
| `economy` | 2.00 | 0.85   | 4     |
| `comfort` | 3.00 | 1.15   | 4     |
| `xl`      | 4.00 | 1.40   | 6     |

- `distanceKm` is the straight-line distance × 1.3 for streets, to one
  decimal; the fare is `base + perKm × km`, rounded to 0.10 credits. For
  example, Bahçelievler → Atakule (6.4 km) is 7.40 / 10.40 / 13.00 credits
  and Kızılay → Atakule (5.1 km) is 6.30 / 8.90 / 11.10.
- `tripMinutes` is 1.5 minutes per km, between 3 and 12.
- After booking, a driver is matched in 10 seconds and is 2–5 minutes away.
  Then the trip takes `tripMinutes`.
- Demo deployments may speed time up (`SUPERAPP_TIME_SCALE`, e.g. 60 in
  the e2e suite), but never below two real-time floors: matching takes at
  least 3 seconds, and pickup is at least **30 seconds** after booking, so
  there is always time to cancel for free.

A ride stores these times when it is booked; its status is worked out from
them and the server's clock on every read. Nothing runs in the background.

## Objects

### Quote

```json
{
  "quotes": [
    {
      "type": "economy",
      "label": "Economy",
      "seats": 4,
      "fare": 630,
      "pickupMinutes": 4,
      "available": true
    },
    {
      "type": "comfort",
      "label": "Comfort",
      "seats": 4,
      "fare": 890,
      "pickupMinutes": null,
      "available": false
    },
    {
      "type": "xl",
      "label": "XL",
      "seats": 6,
      "fare": 1110,
      "pickupMinutes": 2,
      "available": true
    }
  ],
  "distanceKm": 5.1,
  "tripMinutes": 8
}
```

A type is `available` while at least one of its drivers is active, not
frozen and not on a trip; otherwise its `pickupMinutes` is `null` ("No
drivers nearby").

### Ride

```json
{
  "id": "seed-ride01",
  "code": "2L76",
  "rider": {
    "username": "illlhanozkan",
    "fullname": "Ilhan Ozkan",
    "image": "/avatars/illlhanozkan.svg"
  },
  "driver": {
    "username": "ahmet_drives",
    "fullname": "Ahmet Kaya",
    "image": "/avatars/ahmet_drives.svg",
    "vehicle": {
      "make": "Toyota",
      "model": "Corolla",
      "color": "White",
      "plate": "06 AK 1234"
    },
    "rideType": "economy",
    "seats": 4
  },
  "from": {
    "id": "bahcelievler",
    "name": "Bahçelievler",
    "area": "Çankaya",
    "lat": 39.9227,
    "lng": 32.8234
  },
  "to": {
    "id": "atakule",
    "name": "Atakule",
    "area": "Çankaya",
    "lat": 39.8858,
    "lng": 32.8556
  },
  "type": "economy",
  "fare": 740,
  "distanceKm": 6.4,
  "requestedAt": "2026-10-07T13:46:00.000Z",
  "driverAssignedAt": "2026-10-07T13:46:10.000Z",
  "pickupAt": "2026-10-07T13:50:10.000Z",
  "dropoffAt": "2026-10-07T14:00:10.000Z",
  "cancelledAt": null,
  "paymentTransferId": "seed-tx-ride01",
  "refundTransferId": null,
  "status": "completed",
  "stages": [
    {
      "status": "finding",
      "label": "Finding your driver",
      "at": "2026-10-07T13:46:00.000Z",
      "reached": true
    },
    {
      "status": "arriving",
      "label": "Ahmet is on the way",
      "at": "2026-10-07T13:46:10.000Z",
      "reached": true
    },
    {
      "status": "on_trip",
      "label": "Picked up",
      "at": "2026-10-07T13:50:10.000Z",
      "reached": true
    },
    {
      "status": "completed",
      "label": "Arrived at Atakule",
      "at": "2026-10-07T14:00:10.000Z",
      "reached": true
    }
  ],
  "eta": null,
  "nextChangeAt": null,
  "progress": { "leg": null, "fraction": 1 },
  "canCancel": false
}
```

| Field          | Meaning                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `code`         | A short code to show people; `id` is the identity                                                                         |
| `driver`       | The driver and car as they were when the ride was booked                                                                  |
| `status`       | `finding` → `arriving` (at `driverAssignedAt`) → `on_trip` (at `pickupAt`) → `completed` (at `dropoffAt`), or `cancelled` |
| `stages`       | The steps so far and to come, with their times; a cancellation ends the list                                              |
| `eta`          | When the rider next arrives somewhere: the pickup until then, the destination during the trip, else `null`                |
| `nextChangeAt` | When `status` changes next (`null` once it is final): poll then                                                           |
| `progress`     | The current leg (`pickup` while the driver comes, `trip` while riding) and how far along it is, 0–1                       |
| `canCancel`    | `true` until pickup                                                                                                       |

The fare is a `ride` transfer from the rider to the driver
(`paymentTransferId`), pending for the driver until `pickupAt`. A
cancellation adds a `ride_refund` transfer (`refundTransferId`). Both show in
`GET /api/wallet/activity` with `context: { type: "ride", id, code }`.

## Booking

### `GET /api/rides/quote`

Fares for every type and whether each has a free driver. It is the same for
everyone, so shared caches may keep it for a minute
(`Cache-Control: public, s-maxage=60`); booking checks both again. A missing
or unknown place, or the same place twice, is a 400 (`path` is `from` or
`to`).

### `POST /api/rides`

Books a ride for the current user and pays the fare. `expectedFare` is the
fare the rider was shown: if the server's price differs, nothing is booked
and the answer is 409 `price_changed`. The driver is picked from the free
drivers of the type, the same way for the same request, and never twice at
once: each driver has one lock, which a booking takes in the same
transaction as the payment.

```sh
curl -X POST http://localhost:3000/api/rides \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: 9b2f4c1e-7d3a-4f0b-8a51-2c6e1d0f3b77' \
  -d '{ "from": "kizilay", "to": "atakule", "type": "economy", "expectedFare": 630 }'
```

The response's `Location` is the ride. Retrying with the same key returns
the original response with `Idempotent-Replayed: true` and books nothing
again.

| Status | `code`                   | When                                                        |
| ------ | ------------------------ | ----------------------------------------------------------- |
| 400    | `validation_error`       | Unknown or equal places, unknown `type`, bad fare, no key   |
| 402    | `insufficient_funds`     | Your available credits don't cover the fare                 |
| 403    | `wallet_frozen`          | Your wallet is frozen                                       |
| 409    | `price_changed`          | `expectedFare` is not the current fare; quote again         |
| 409    | `invalid_state`          | You already have a ride in progress (one at a time)         |
| 409    | `conflict`               | Busy (concurrent writes on Sanity); retry with the same key |
| 422    | `unavailable`            | No driver of this type is free right now                    |
| 422    | `idempotency_key_reused` | The key was used for a different request                    |
| 422    | `limit_exceeded`         | The demo store is full                                      |
| 429    | `rate_limited`           | More than 12 money operations in a minute                   |

## Reading

### `GET /api/rides`

The current user's rides, newest first, paged like the timeline: pass
`nextCursor` back as `cursor` until it is `null`. `as=driver` lists the
rides a driver account drove instead (read-only: drivers can't cancel or
tip). `serverNow` is the clock the statuses were worked out with.

### `GET /api/rides/:id`

One ride, for its rider and its driver only; anyone else, and unknown ids,
get 404. Poll it at `nextChangeAt`.

## After booking

### `POST /api/rides/:id/cancel`

The rider cancels before pickup and gets the whole fare back; the driver is
free again at once. It takes no key and no body: cancelling again answers
200 with the ride as it is. The response includes the rider's wallet.

- 403 `forbidden` for the driver; 404 for anyone else and unknown ids.
- 409 `invalid_state` at or after `pickupAt`: there is no cancelling once
  you are in the car.

### `POST /api/rides/:id/tip`

Once the ride is `completed`, the rider can tip the driver 0.50–50.00
credits. It is a wallet `tip` transfer with the ride as its context; the
response's `Location` is its receipt.

| Status | `code`                   | When                                       |
| ------ | ------------------------ | ------------------------------------------ |
| 400    | `validation_error`       | `amount` outside 50..5000, or no key       |
| 402    | `insufficient_funds`     | Your available credits don't cover it      |
| 403    | `forbidden`              | The driver tipping their own ride          |
| 403    | `wallet_frozen`          | Your wallet or the driver's is frozen      |
| 404    | `not_found`              | Not your ride, or no such ride             |
| 409    | `invalid_state`          | The ride isn't complete (or was cancelled) |
| 422    | `idempotency_key_reused` | The key was used for a different request   |

## Elsewhere in the API

- `GET /api/activity` lists the current user's ride in progress as live
  activity: title "Ride to Atakule", status "Finding your driver", "Ahmet
  is on the way" or "On the way to Atakule", `eta` as on the ride, and
  `href` `/rides/<id>`.
- `GET /api/notifications` includes a `ride` notification
  (`event: "completed"`, id `ride-completed-<rideId>`) once the drop-off
  time has passed.

## Drivers and moderation

On Sanity, drivers are public `driverProfile` documents (username, vehicle,
ride type, seats, active), edited live in Studio; their name and avatar come
from their user. Switching `active` off stops new matches without touching
trips in progress. A frozen wallet (`walletFreeze`) also takes a driver off
the road. Rides and driver locks are private documents only the app writes.
