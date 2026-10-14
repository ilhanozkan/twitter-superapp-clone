# Businesses and menus API

A **business** is an account with `accountType: "business"` and a business
profile; its name and avatar always come from the account. Businesses sell
**products**, listed on their menu and shown as cards on Tweets. Products
and profiles are edited in Studio; the app's only writes are the two
switches a business's managers use: "Accepting orders" and a product's
availability.

These endpoints belong to the `shop` feature. They follow the
[SuperApp conventions](../API.md#superapp-conventions): amounts are integer
cents (`450` is 4.50 credits), and a business you don't run answers 404 to
your writes, as if it weren't there. Nothing here moves money, so nothing
takes an `Idempotency-Key`.

| Method & path                            | Request                          | Success                  |
| ---------------------------------------- | -------------------------------- | ------------------------ |
| `GET /api/businesses`                    | `?category=`                     | `200 { items }`          |
| `GET /api/businesses/:username`          | —                                | `200 { business, menu }` |
| `PUT /api/businesses/:username/settings` | `{ "acceptingOrders": boolean }` | `200 { business }`       |
| `GET /api/products/:id`                  | —                                | `200 { product, card }`  |
| `PUT /api/products/:id/availability`     | `{ "available": boolean }`       | `200 { product }`        |
| `GET /api/products/attachable`           | —                                | `200 { items }`          |

Response types are in `types/Shop.ts`, next to the objects.

## Objects

### Business

The business with its profile and its state now (`GET /api/businesses/:username`,
the settings switch):

```json
{
  "username": "kizilaykahve",
  "fullname": "Kızılay Kahve",
  "image": "/avatars/kizilaykahve.svg",
  "banner": "/media/banner-kizilaykahve.svg",
  "category": "cafe",
  "description": "Turkish coffee, pistachio lattes and fresh simit in the heart of Kızılay.",
  "placeId": "kizilay",
  "address": "Kızılay Square, Çankaya, Ankara",
  "hours": {
    "opens": "00:00",
    "closes": "00:00",
    "timeZone": "Europe/Istanbul"
  },
  "acceptingOrders": true,
  "prepMinutes": 3,
  "deliveryMinutes": 6,
  "deliveryFee": 150,
  "minimumOrder": 300,
  "greeting": "Merhaba! 👋 This is Kızılay Kahve's automatic greeting. …",
  "managers": [],
  "status": {
    "open": true,
    "orderable": true,
    "reason": null,
    "label": "Open 24 hours",
    "opensAt": null,
    "closesAt": null
  },
  "etaMinutes": [9, 12]
}
```

- `category` is `cafe`, `restaurant`, `healthy` or `shop`.
- `hours` are wall-clock times in `timeZone`. Closing before opening runs
  past midnight; the same time means open 24 hours.
- `status` is derived at read time from the hours, the "Accepting orders"
  switch and the wallet:
  - `orderable` is open, accepting orders and not frozen.
  - `reason` says why it isn't: `closed`, `paused` or `frozen` (a paused
    or frozen business reads "Not taking orders right now" whatever the
    time).
  - `label` is the text to show, such as "Open now · Closes 04:00" or
    "Closed · Opens 11:00".
  - `opensAt` and `closesAt` are the next change, as ISO times (null for
    24-hour businesses).
- `etaMinutes` is the delivery estimate: prep + delivery, and 3 minutes
  more.
- `managers` run the business in the app besides the account itself.

### Product

```json
{
  "id": "seed-p-kk-latte",
  "business": "kizilaykahve",
  "section": "Coffee",
  "name": "Pistachio latte",
  "description": "Espresso, steamed milk and Antep pistachio cream.",
  "price": 500,
  "image": "/media/menu/pistachio-latte.svg",
  "imageAlt": "A tall glass of pale green pistachio latte topped with crushed pistachios",
  "available": true,
  "position": 2
}
```

- `available: false` means sold out: still on the menu, but it can't be
  attached to a new Tweet or ordered (`POST /api/orders` answers 422
  `unavailable`, see [orders](orders.md#post-apiorders)).
- `imageAlt` describes the image; show it as the image's alternative text.
- A product appears only while its business is a business account with a
  profile, and once Studio has its name, section and a price of
  0.10–200.00 credits. Products are live-edited in Studio, so one being
  typed stays hidden until then.

### Menu

`menu` is a list of sections. Sections come in the order of their first
product; products are ordered by `position` (then by id).

```json
[
  { "title": "Coffee", "products": [{ "id": "seed-p-kk-turkish", … }, …] },
  { "title": "Bakery", "products": [{ "id": "seed-p-kk-simit", … }, …] }
]
```

### Product card

What a Tweet with a product shows: the product plus its business as it is
now.

```json
{
  "id": "seed-p-kk-latte",
  "name": "Pistachio latte",
  "price": 500,
  "image": "/media/menu/pistachio-latte.svg",
  "imageAlt": "A tall glass of pale green pistachio latte topped with crushed pistachios",
  "available": true,
  "business": {
    "username": "kizilaykahve",
    "fullname": "Kızılay Kahve",
    "image": "/avatars/kizilaykahve.svg",
    "status": {
      "open": true,
      "orderable": true,
      "reason": null,
      "label": "Open 24 hours",
      "opensAt": null,
      "closesAt": null
    },
    "etaMinutes": [9, 12]
  }
}
```

On a Tweet it is `"attachment": { "type": "product", "product": { … } }`.
`product` is null once the product is deleted (or its business is no longer
a business), and the whole attachment is null while the shop is off. Cards
are read in one batch per page of Tweets.

### Business summary

A Food hub card: the business's `username`, `fullname`, `image`, `banner`,
`category`, `placeId`, `deliveryFee`, `status` and `etaMinutes`, plus
`highlights`: the names of the first three available products, top to
bottom on its menu.

## Reading

### `GET /api/businesses`

Every business, by name, as summaries. `category` (`cafe`, `restaurant`,
`healthy` or `shop`) keeps only that category; anything else is a 400. The
list is the same for everyone, so shared caches may keep it for 30 seconds
(`public, s-maxage=30`).

### `GET /api/businesses/:username`

The business and its menu, sold-out products included. The username is
case-insensitive; a personal or unknown account is a 404 "Business not
found".

### `GET /api/products/:id`

The product and its card, for the product dialog and attachment previews.
Unknown ids, and ids that aren't plain keys (such as `drafts.…`), are 404.

### `GET /api/products/attachable`

What the composer's product picker suggests: the available products of the
businesses the current user runs (their own account's first, then those
they manage), each in menu order. While [orders](orders.md) are on, the
available products from the user's last 50 delivered orders follow, latest
delivery first, each once (so someone who runs nothing still gets what they
bought). It's only a suggestion: any account can attach any available
product by id, like sharing a link (see
[product attachments](../API.md#product-attachments-on-tweets)).

## Managing a business

Both switches are for the business's managers: the business account itself
and the usernames in `managers`. To anyone else they answer 404, the same
as for a business or product that doesn't exist. They set a state, so
repeating one is harmless.

```sh
curl -X PUT http://localhost:3000/api/products/seed-p-sa-mug/availability \
  -H 'Content-Type: application/json' \
  -d '{ "available": false }'
```

### `PUT /api/businesses/:username/settings`

`{ "acceptingOrders": false }` pauses orders (the business then reads "Not
taking orders right now"); `true` resumes them. Answers the business as it
is afterwards.

### `PUT /api/products/:id/availability`

`{ "available": false }` marks the product sold out; `true` brings it back.
Answers the product as it is afterwards.

| Status | `code`                   | When                                                       |
| ------ | ------------------------ | ---------------------------------------------------------- |
| 400    | `validation_error`       | The body's boolean is missing or not a boolean             |
| 403    | `read_only`, `forbidden` | The site is read-only; a cross-origin request              |
| 404    | `not_found`              | No such business or product, or you don't run the business |
| 415    | `unsupported_media_type` | The body isn't JSON                                        |
| 429    | `rate_limited`           | Too many writes from this address                          |
| 503    | `service_unavailable`    | Sanity without `SANITY_API_TOKEN`: the shop is read-only   |

Fields other than the switch, such as `username` or `managers`, are
ignored: profiles and menus are edited in Studio.

## Turned off

With `shop` in `DISABLED_FEATURES` every endpoint here answers 404 "This
feature is turned off", `GET /api/me` reports `"shop": false`, Tweets carry
no product cards and new Tweets can't attach products. On Sanity the shop
stays readable without a token, because products and business profiles are
public documents.

## Demo data

| Business       | Menu                                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kizilaykahve` | Coffee: Türk kahvesi 3.50, Pistachio latte 5.00 (`seed-p-kk-latte`), Cold brew 4.50 · Bakery: Simit 2.50 (`seed-p-kk-simit`), San Sebastian cheesecake 6.00 |
| `lahmacunlab`  | Mains: Lahmacun 4.00 (`seed-p-ll-lahmacun`), Adana kebab 11.00 · Soups: Mercimek çorbası 3.50 · Drinks: Ayran 1.50 · Desserts: Künefe 6.50                  |
| `bowlandco`    | Bowls: Falafel bowl 9.00 (`seed-p-bc-falafel`), Quinoa salad 8.50 · Drinks: Fresh lemonade 3.00                                                             |
| `superapp`     | Merch: Sticker pack 3.00 (`seed-p-sa-stickers`), SuperApp mug 12.00 (`seed-p-sa-mug`), Hoodie 35.00 (sold out)                                              |

Each business has a Tweet with one of its products: `seed-t22` (the
latte), `seed-t23` (lahmacun), `seed-t24` (falafel bowl) and `seed-t25`
(stickers). The demo user manages `@superapp`, so its products are the
picker's suggestions.
