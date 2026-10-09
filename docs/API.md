# REST API

All endpoints live under `/api`, take and return JSON, and act as the
**current user**. There is no sign-in yet: the current user is the account
named by `DEMO_USERNAME` (default `illlhanozkan`). Identity is decided on the
server (`lib/auth.ts`) and is never read from request bodies.

> **Public deployments:** without sign-in, every visitor acts as
> `DEMO_USERNAME`. With a Sanity write token that means anyone can post, react
> and delete that account's tweets. Set `READ_ONLY=true` to reject all writes
> (403 `read_only`; `GET /api/me` reports `readOnly`) until authentication is
> added.

## Conventions

- **Writes** (`POST`, `PUT`, `DELETE`) must come from the same origin (checked
  with the `Origin` header) and are rate limited per client
  (`WRITE_RATE_LIMIT` per minute, default 30; `0` disables it). The client is
  identified by its socket address; behind a proxy, set `TRUST_PROXY=true` to
  use the right-most `X-Forwarded-For` entry (the address the proxy saw) and
  `X-Forwarded-Host` for the origin check. On Vercel the platform's headers
  are used automatically. A proxy without `TRUST_PROXY` must pass the
  original `Host` header on, or every browser write is rejected as
  cross-origin. Request bodies must
  be `Content-Type: application/json` and at most 16 KB; routes that take no
  body do not read one.
- **Flags** (`READ_ONLY`, `TRUST_PROXY`) accept `true`, `1`, `yes` or `on`.
- **Caching**: responses that depend on the current user are
  `private, no-store`, and so is every SuperApp `GET` except
  `GET /api/places` (`public, max-age=3600`), `GET /api/businesses`
  (`public, s-maxage=30`) and `GET /api/rides/quote` (`public, s-maxage=60`).
  Trends may be cached by shared caches for a minute. Error responses are
  never cached.
- **Errors** share one shape. `requestId` is also sent as the `X-Request-Id`
  header and appears in server logs:

  ```json
  {
    "error": {
      "code": "validation_error",
      "message": "The request is invalid",
      "details": [{ "path": "text", "message": "Text cannot be empty" }],
      "requestId": "c93c45de-f581-4a88-ab62-e9e8fac1e920"
    }
  }
  ```

  | Status | `code`                   | When                                                                               |
  | ------ | ------------------------ | ---------------------------------------------------------------------------------- |
  | 400    | `validation_error`       | Invalid body, query or `Idempotency-Key` (see `details`)                           |
  | 400    | `bad_request`            | The body is not a JSON object                                                      |
  | 402    | `insufficient_funds`     | The available credits don't cover the amount                                       |
  | 403    | `forbidden`              | Cross-origin write, or an action you can see but may not take (tip your own Tweet) |
  | 403    | `wallet_frozen`          | A moderator froze the sender's or the recipient's wallet                           |
  | 403    | `read_only`              | Any write while `READ_ONLY=true`                                                   |
  | 404    | `not_found`              | Unknown, moderated or not-yours record; unknown user or endpoint; a feature is off |
  | 405    | `method_not_allowed`     | See the `Allow` header                                                             |
  | 409    | `invalid_state`          | The record can't do that now (a request that is already paid, declined or expired) |
  | 409    | `price_changed`          | The expected total or fare is out of date                                          |
  | 409    | `conflict`               | A concurrent write won and retries ran out ("Busy, try again")                     |
  | 415    | `unsupported_media_type` | Body is not `application/json`                                                     |
  | 422    | `limit_exceeded`         | An amount, count or capacity limit                                                 |
  | 422    | `unavailable`            | Closed, paused or sold out; `details` name each `productId`                        |
  | 422    | `idempotency_key_reused` | The `Idempotency-Key` was already used with a different body                       |
  | 429    | `rate_limited`           | See the `Retry-After` header                                                       |
  | 501    | `not_implemented`        | A SuperApp feature whose PR has not shipped yet                                    |
  | 503    | `service_unavailable`    | Data source misconfigured (e.g. Sanity without a token)                            |
  | 500    | `internal_error`         | Anything else (details are only logged)                                            |

  Malformed JSON (400 `Invalid JSON`) and bodies over 16 KB (413) are rejected
  by Next.js before the handler runs, with a plain-text body.

- **Tweets** are returned as:

  ```json
  {
    "id": "seed-t03",
    "text": "Sunrise over the Dolomites this morning. #Photography",
    "image": "/media/mountains.svg",
    "createdAt": "2026-10-08T15:50:00.000Z",
    "author": {
      "username": "lenaframes",
      "fullname": "Lena Hoffmann",
      "image": "/avatars/lenaframes.svg"
    },
    "stats": { "replies": 1, "retweets": 1, "likes": 5, "tips": 2 },
    "viewer": {
      "liked": true,
      "retweeted": false,
      "bookmarked": false,
      "tipped": true
    },
    "attachment": null
  }
  ```

  `viewer` describes the current user's reactions. `stats.tips` counts tips
  (amounts are never public) and `viewer.tipped` says whether you tipped it;
  both read 0 and false while the wallet is off. `attachment` is a product
  card, `{ "type": "product", "product": { … } }` (`product` is null once
  the product is deleted), or null, and always null while the shop is off.

- **Text** (tweets and replies) is trimmed, line endings are normalized, and
  control characters and bidi overrides/isolates are removed. It must be 1–280 characters, counted as
  Unicode code points: most emoji count once, but flags, skin tones and joined
  emoji (such as families) are several code points. **Images** must be `https://`
  URLs or paths on this site such as `/media/coffee.svg`.

## SuperApp conventions

These apply to the SuperApp endpoints (wallet, messages, orders, rides,
stories) in addition to everything above. How the features are built (the
demo-credit ledger, holds, privacy) is in [SUPERAPP.md](SUPERAPP.md).

- **Amounts** are integer cents of demo credits: `1250` is 12.50 credits.
  Floats, strings, zero and negatives fail validation. Credits have no cash
  value and can't be bought, withdrawn or exchanged.
- **Idempotency.** Every `POST` that moves credits (send, top-up, tip,
  payment requests and paying them, chat payments, orders, rides, ride tips)
  and chat message sends require an `Idempotency-Key` header: 8–64 letters,
  digits, `-` or `_`, for example a UUID. A missing or invalid key is a 400
  `validation_error` with `details[0].path` `"Idempotency-Key"`.
  - Send the same key when you retry the same request. If it already
    happened, you get the original result with the **original status** and
    an `Idempotent-Replayed: true` header, and nothing happens twice, even
    when two identical requests race.
  - The same key with a different body is a 422 `idempotency_key_reused`.
  - Keys are scoped to the current user and the kind of operation, so they
    never collide with anyone else's.
  - State changes (decline or cancel a request, cancel an order or a ride,
    join or leave, mark read) take no key: they are idempotent by their
    target state. Repeating one answers 200 with the record as it is; an
    incompatible state is a 409 `invalid_state`.
- **Writes** keep the rules above: same-origin check, the per-client write
  limit, `READ_ONLY` → 403 `read_only`, JSON bodies of at most 16 KB, and no
  body parsing on routes that take none.
- **Per-user limits.** On top of the per-client limit, each acting user has
  budgets per kind of action, answered with 429 `rate_limited` and
  `Retry-After`. Without sign-in every visitor acts as the same user, so on a
  public deployment these limit the deployment as a whole.
  `WRITE_RATE_LIMIT=0` turns them off too.

  | Bucket       | Covers                                                       | Limit       |
  | ------------ | ------------------------------------------------------------ | ----------- |
  | `money`      | Sends, top-ups, tips, creating and paying requests, payments | 12 / minute |
  | `messages`   | Chat messages                                                | 30 / minute |
  | `stories`    | New stories                                                  | 10 / hour   |
  | `channels`   | New channels                                                 | 5 / hour    |
  | `demoOrders` | Simulated customer orders                                    | 5 / hour    |

- **Visibility.** Records only their parties may see (receipts, payment
  requests, conversations, orders, rides, story viewers, the business board)
  answer **404, not 403**, to everyone else, so ids reveal nothing. Actions
  on something you can see but may not do answer 403, such as tipping your
  own Tweet or paying your own request.
- **Identity** always comes from the server. Bodies name only the _other_
  party (`to`, `from` on a payment request, `with`); fields such as
  `from` on a payment, `payer`, `requester`, `buyer`, `author` or `username`
  are ignored.
- **Time.** Pending credits, request expiry, orders and rides are derived
  from stored timestamps and the server's clock on every read, so nothing
  runs in the background. Time-derived responses include `serverNow`.
- **Feature switches.** A feature that is off (its PR has not shipped, or it
  is listed in `DISABLED_FEATURES`) answers 404 `not_found` "This feature is
  turned off" on all its routes. On Sanity without `SANITY_API_TOKEN`, the
  private features (wallet, messages, channels, orders, rides) answer 503
  `service_unavailable`, for example "Wallet needs SANITY_API_TOKEN on this
  deployment". `GET /api/me` reports which features are on.

## Endpoints

| Method & path                   | Description                                                                                                                     | Success                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `GET /api/tweets`               | Timeline, newest first (query below)                                                                                            | `200 { items, nextCursor }`       |
| `POST /api/tweets`              | Create a tweet: `{ "text": "…", "image"?: "https://…", "attachment"? }` (below)                                                 | `201 { tweet }` + `Location`      |
| `GET /api/tweets/:id`           | One tweet                                                                                                                       | `200 { tweet }`                   |
| `DELETE /api/tweets/:id`        | Delete your own tweet with its replies and reactions                                                                            | `204`                             |
| `GET /api/tweets/:id/replies`   | Replies, oldest first                                                                                                           | `200 { items }`                   |
| `POST /api/tweets/:id/replies`  | Reply: `{ "text": "…" }`                                                                                                        | `201 { reply }`                   |
| `PUT /api/tweets/:id/like`      | Like (idempotent); `DELETE` unlikes                                                                                             | `200 { tweet }`                   |
| `PUT /api/tweets/:id/retweet`   | Retweet (idempotent); `DELETE` undoes it                                                                                        | `200 { tweet }`                   |
| `PUT /api/tweets/:id/bookmark`  | Bookmark (idempotent); `DELETE` removes it                                                                                      | `200 { tweet }`                   |
| `POST /api/tweets/:id/tip`      | Tip a tweet with demo credits ([wallet](api/wallet.md))                                                                         | `201 { transfer, wallet, tweet }` |
| `GET /api/users?q=&limit=`      | People whose username or name matches every word ([wallet](api/wallet.md))                                                      | `200 { items }`                   |
| `GET /api/users/:username`      | Profile with `tweetCount` and `accountType` (case-insensitive)                                                                  | `200 { user }`                    |
| `GET /api/me`                   | The current user, whether writes are allowed, SuperApp features                                                                 | `200 { user, readOnly, … }`       |
| `GET /api/notifications?limit=` | Likes, retweets and replies on your tweets, plus SuperApp notifications (tips, payments, requests, orders, rides), newest first | `200 { items }`                   |
| `GET /api/activity?since=`      | Badge counts and live activity for the app shell                                                                                | `200 { serverNow, … }`            |
| `GET /api/places`               | The fixed places for deliveries and rides; cacheable for an hour                                                                | `200 { items }`                   |
| `GET /api/trends?limit=`        | Most used hashtags (default 10, max 20); cacheable for 60 s                                                                     | `200 { items }`                   |
| `GET /api/health`               | Liveness and the configured data source                                                                                         | `200 { status, dataSource }`      |

`GET /api/me` also returns `features` (which SuperApp features are on, e.g.
`{ "wallet": true, "shop": false, … }`) and `managedBusinesses` (the
businesses the current user runs: their own account if it is a business,
plus those they manage).

### SuperApp endpoints

| Area                 | Endpoints                                                 | Docs                                    |
| -------------------- | --------------------------------------------------------- | --------------------------------------- |
| Wallet and tips      | `/api/wallet/**`, `/api/tweets/:id/tip`, `/api/users?q=`  | [docs/api/wallet.md](api/wallet.md)     |
| Messages             | `/api/conversations/**`                                   | [docs/api/messages.md](api/messages.md) |
| Channels             | `/api/channels/**`                                        | [docs/api/channels.md](api/channels.md) |
| Businesses and menus | `/api/businesses/**`, `/api/products/**`                  | [docs/api/shop.md](api/shop.md)         |
| Orders               | `/api/orders/**`, `/api/businesses/:username/demo-orders` | [docs/api/orders.md](api/orders.md)     |
| Rides                | `/api/rides/**`                                           | [docs/api/rides.md](api/rides.md)       |
| Stories              | `/api/stories/**`                                         | [docs/api/stories.md](api/stories.md)   |

### Product attachments on tweets

`POST /api/tweets` takes an optional
`"attachment": { "type": "product", "productId": "seed-p-kk-latte" }`. Any
account may attach any product, like sharing a link.

| Status | `code`             | When                                                                          |
| ------ | ------------------ | ----------------------------------------------------------------------------- |
| 400    | `validation_error` | The shop is off (`details[0].path` `"attachment"`), or a malformed attachment |
| 404    | `not_found`        | No such product                                                               |
| 422    | `unavailable`      | The product is sold out (`details` name its `productId`)                      |

### `GET /api/activity`

What the app shell polls (every 30 s while visible) for its badges and the
live activity card. It never writes: reading does not mark anything seen.

```json
{
  "serverNow": "2026-10-09T12:30:00.000Z",
  "unreadConversations": 1,
  "newNotifications": 3,
  "live": [
    {
      "kind": "ride",
      "id": "ride-…",
      "title": "Ride to Atakule",
      "status": "Driver on the way",
      "eta": "2026-10-09T12:34:00.000Z",
      "href": "/rides/ride-…",
      "nextChangeAt": "2026-10-09T12:31:00.000Z"
    }
  ]
}
```

- `since` (optional, ISO 8601 with a time zone): count only notifications
  newer than this. The app sends the time this device last opened
  Notifications; without it every notification counts.
- `newNotifications` stops at 99 (shown as "99+").
- `unreadConversations` is 0 and `live` lists nothing for features that are
  off. A feature whose read fails counts as nothing rather than failing the
  response (the error is logged).

### `GET /api/tweets` query

| Param        | Description                                                  |
| ------------ | ------------------------------------------------------------ |
| `author`     | Only tweets by this username                                 |
| `q`          | Search text, usernames and names (max 100 characters)        |
| `likedBy`    | Only tweets liked by this username                           |
| `bookmarked` | `true`: only the current user's bookmarks (they are private) |
| `limit`      | Page size, 1–50 (default 20)                                 |
| `cursor`     | `nextCursor` from the previous page                          |

Reaction endpoints return the updated tweet, so clients can reconcile
optimistic updates. Response types are in `types/Api.ts`.

## Security headers

`next.config.js` sends a Content-Security-Policy (same-origin scripts, styles
and connections; `https:` images; no framing), `X-Content-Type-Options`,
`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and
`Cross-Origin-Opener-Policy` on every response, and drops `X-Powered-By`.
