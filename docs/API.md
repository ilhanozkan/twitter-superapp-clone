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
  `private, no-store`; trends may be cached by shared caches for a minute.
  Error responses are never cached.
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

  | Status | `code`                   | When                                                    |
  | ------ | ------------------------ | ------------------------------------------------------- |
  | 400    | `validation_error`       | Invalid body or query (see `details`)                   |
  | 400    | `bad_request`            | The body is not a JSON object                           |
  | 403    | `forbidden`              | Cross-origin write, or deleting someone else's tweet    |
  | 403    | `read_only`              | Any write while `READ_ONLY=true`                        |
  | 404    | `not_found`              | Unknown or moderated tweet, unknown user or endpoint    |
  | 405    | `method_not_allowed`     | See the `Allow` header                                  |
  | 415    | `unsupported_media_type` | Body is not `application/json`                          |
  | 429    | `rate_limited`           | See the `Retry-After` header                            |
  | 503    | `service_unavailable`    | Data source misconfigured (e.g. Sanity without a token) |
  | 500    | `internal_error`         | Anything else (details are only logged)                 |

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
    "stats": { "replies": 1, "retweets": 1, "likes": 5 },
    "viewer": { "liked": true, "retweeted": false, "bookmarked": false }
  }
  ```

  `viewer` describes the current user's reactions.

- **Text** (tweets and replies) is trimmed, line endings are normalized, and
  control characters are removed. It must be 1–280 characters, counted as
  Unicode code points: most emoji count once, but flags, skin tones and joined
  emoji (such as families) are several code points. **Images** must be `https://`
  URLs or paths on this site such as `/media/coffee.svg`.

## Endpoints

| Method & path                   | Description                                                          | Success                      |
| ------------------------------- | -------------------------------------------------------------------- | ---------------------------- |
| `GET /api/tweets`               | Timeline, newest first (query below)                                 | `200 { items, nextCursor }`  |
| `POST /api/tweets`              | Create a tweet: `{ "text": "…", "image"?: "https://…" }`             | `201 { tweet }` + `Location` |
| `GET /api/tweets/:id`           | One tweet                                                            | `200 { tweet }`              |
| `DELETE /api/tweets/:id`        | Delete your own tweet with its replies and reactions                 | `204`                        |
| `GET /api/tweets/:id/replies`   | Replies, oldest first                                                | `200 { items }`              |
| `POST /api/tweets/:id/replies`  | Reply: `{ "text": "…" }`                                             | `201 { reply }`              |
| `PUT /api/tweets/:id/like`      | Like (idempotent); `DELETE` unlikes                                  | `200 { tweet }`              |
| `PUT /api/tweets/:id/retweet`   | Retweet (idempotent); `DELETE` undoes it                             | `200 { tweet }`              |
| `PUT /api/tweets/:id/bookmark`  | Bookmark (idempotent); `DELETE` removes it                           | `200 { tweet }`              |
| `GET /api/users/:username`      | Profile with `tweetCount` (case-insensitive)                         | `200 { user }`               |
| `GET /api/me`                   | The current user's profile and whether writes are allowed            | `200 { user, readOnly }`     |
| `GET /api/notifications?limit=` | Likes, retweets and replies others made on your tweets, newest first | `200 { items }`              |
| `GET /api/trends?limit=`        | Most used hashtags (default 10, max 20); cacheable for 60 s          | `200 { items }`              |
| `GET /api/health`               | Liveness and the configured data source                              | `200 { status, dataSource }` |

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
