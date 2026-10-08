# REST API

All endpoints live under `/api`, take and return JSON, and act as the
**current user**. There is no sign-in yet: the current user is the account
named by `DEMO_USERNAME` (default `illlhanozkan`). Identity is decided on the
server (`lib/auth.ts`) and is never read from request bodies.

## Conventions

- **Writes** (`POST`, `PUT`, `DELETE`) must come from the same origin (checked
  with the `Origin` header) and are rate limited per client
  (`WRITE_RATE_LIMIT` per minute, default 30; `0` disables it). Request bodies
  must be `Content-Type: application/json` and at most 16 KB.
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
  | 404    | `not_found`              | Unknown or moderated tweet, unknown user                |
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
  Unicode code points (an emoji counts once). **Images** must be `https://`
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
| `GET /api/me`                   | The current user's profile                                           | `200 { user }`               |
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
