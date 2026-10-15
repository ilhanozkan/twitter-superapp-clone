# Messages API

Direct messages between two people, with **payments and payment requests
inside the conversation** and Tweets shared into it. The credits are the
wallet's demo credits ([Wallet API](wallet.md)): they have no cash value.

These endpoints belong to the `messages` feature. They follow the
[SuperApp conventions](../API.md#superapp-conventions): sends need an
`Idempotency-Key`, amounts are integer cents (`450` is 4.50 credits), and
conversations you are not in answer 404, so ids reveal nothing. The acting
user always comes from the server; bodies never name the author, sender or
requester (such fields are ignored).

| Method & path                          | Request                                                     | Success                                                    |
| -------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| `GET /api/conversations`               | —                                                           | `200 { items }`                                            |
| `POST /api/conversations`              | `{ "with": username }`                                      | `201 { conversation }` + `Location`, or `200` if it exists |
| `GET /api/conversations/:id`           | —                                                           | `200 { conversation }`                                     |
| `GET /api/conversations/:id/messages`  | `?before=` or `?after=` cursor, `limit=1..50`               | `200 { items, olderCursor, newestCursor, serverNow }`      |
| `POST /api/conversations/:id/messages` | key; `{ "text": 1..1000 or "" with "tweetId", "storyId"? }` | `201 { message }`                                          |
| `POST /api/conversations/:id/payments` | key; `{ "amount": 50..20000, "note"?: ≤100 }`               | `201 { message, transfer, wallet }` + `Location`           |
| `POST /api/conversations/:id/requests` | key; `{ "amount": 50..20000, "note"?: ≤100 }`               | `201 { message, request }` + `Location`                    |
| `PUT /api/conversations/:id/read`      | —                                                           | `204`                                                      |

"key" means the `Idempotency-Key` header is required. Response types are in
`types/Message.ts`, next to the objects.

## Objects

### Conversation

```json
{
  "id": "dm-illlhanozkan-sarahcodes",
  "kind": "direct",
  "other": {
    "username": "sarahcodes",
    "fullname": "Sarah Chen",
    "image": "/avatars/sarahcodes.svg"
  },
  "lastMessage": { "…": "a message" },
  "unread": 1,
  "otherReadAt": "2026-10-09T07:30:00.000Z",
  "updatedAt": "2026-10-09T07:30:00.000Z"
}
```

- The `id` of the one conversation between two people is
  `dm-<username>-<username>`, lower case and sorted, so either side can find
  it.
- `unread` counts the messages the other person wrote after you last read
  the conversation. `otherReadAt` is when the other person last read it:
  your last message is "Seen" once `otherReadAt` is at or after its time.
- `updatedAt` is the time of the last message (or of the opening, for an
  empty conversation). The inbox is sorted by it, newest first.

### Message

```json
{
  "id": "seed-msg-sarah-03",
  "conversationId": "dm-illlhanozkan-sarahcodes",
  "author": {
    "username": "sarahcodes",
    "fullname": "Sarah Chen",
    "image": "/avatars/sarahcodes.svg"
  },
  "createdAt": "2026-10-09T07:30:00.000Z",
  "body": {
    "type": "request",
    "request": { "id": "seed-req01", "status": "pending", "…": "…" }
  }
}
```

`body.type` says what the message is:

| `type`    | Fields                             | Meaning                                                                                                                                                                                                    |
| --------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`    | `text`, `tweet`, `story`           | Text. `tweet` is a shared Tweet `{ id, author, text }`, `null` once it is deleted or moderated. `story` is the story it replies to, `{ id, author, preview }`; `preview` is `null` once the story is gone. |
| `payment` | `transferId`, `amount`, `note`     | Credits the author sent; the receipt is `/api/wallet/transfers/<transferId>`.                                                                                                                              |
| `request` | `request`                          | A payment request as it is now: its `status` changes when it is paid, declined, cancelled or expires.                                                                                                      |
| `removed` | `by` (`"author"` or `"moderator"`) | A deleted channel message ([Channels API](channels.md)): "Message deleted" by its author, or "Message removed by a moderator".                                                                             |

## Reading

### `GET /api/conversations`

The current user's direct conversations, newest activity first, each with
its last message and unread count. The Messages badge
(`unreadConversations` in `GET /api/activity`) counts the ones with
`unread > 0`.

### `GET /api/conversations/:id`

One conversation, for its two members (404 for everyone else).

### `GET /api/conversations/:id/messages`

A page of messages, **oldest to newest**, ordered by `(createdAt, id)`:

- No cursor: the newest `limit` messages (default 20).
- `before=<olderCursor>`: the `limit` messages before that page ("Load
  older"). `olderCursor` is `null` when the page starts at the first
  message.
- `after=<newestCursor>`: what arrived since, oldest first, at most `limit`.
  This is how clients poll: while nothing is new, the page is empty and
  `newestCursor` stays the cursor you sent.

A message's `createdAt` is set just before its write, so on Sanity a slow
write can land after a newer message was already read, behind the cursor.
The app therefore polls without a cursor (the newest page, merged by id)
until the newest message it shows is 30 s old, and while a request in it is
pending; other clients should do the same.

Sending both `before` and `after`, a cursor the server didn't make, or a
`limit` outside 1–50 is a 400. `serverNow` is the server's clock.

## Writing

### `POST /api/conversations`

Opens the direct conversation with `with` (201), or returns the existing
one (200). Opening a conversation with a business whose profile has a
greeting posts that greeting from the business in the same write, once
(`msg-greeting-<conversationId>`); the greeting says it is automatic.
Opening takes no key: it is idempotent, and concurrent opens create one
conversation.

| Status | `code`             | When                                   |
| ------ | ------------------ | -------------------------------------- |
| 400    | `validation_error` | `with` is missing, invalid or yourself |
| 404    | `not_found`        | No such user                           |

Reading never creates anything: the app shows a draft conversation until
the first message is sent.

### `POST /api/conversations/:id/messages`

Sends a message. `text` is sanitized like Tweet text and is 1–1,000
characters, or empty when sharing a Tweet with `tweetId`. `storyId` makes
it a reply to that story, which must be one you can see (a channel's
`channel-<handle>` id drops it, as [its own route](channels.md) does, and
so does every conversation while stories are off, sending plain text).
Retrying with the same key answers the original `201` with
`Idempotent-Replayed: true` and posts nothing again. For a channel id,
this route and `GET` follow the `channels` switch as well (404 while it is
off, 503 while unconfigured).

| Status | `code`                   | When                                             |
| ------ | ------------------------ | ------------------------------------------------ |
| 400    | `validation_error`       | Bad `text`, `tweetId`, `storyId` or key          |
| 403    | `forbidden`              | Posting in a channel you haven't joined          |
| 404    | `not_found`              | Not your conversation, or no such Tweet or story |
| 422    | `idempotency_key_reused` | The key was used for a different message         |
| 429    | `rate_limited`           | More than 30 messages in a minute                |

### `POST /api/conversations/:id/payments`

Sends `amount` credits to the other member and posts the payment in the
conversation in **one write**: both happen or neither does. The response
has the message, the transfer (its `context` is the conversation) and your
wallet afterwards; `Location` is the receipt. The recipient gets a
`payment` notification that opens the conversation. A retry with the same
key replays the original response and moves nothing.

| Status | `code`                   | When                                                               |
| ------ | ------------------------ | ------------------------------------------------------------------ |
| 400    | `validation_error`       | Bad `amount`, `note` or key                                        |
| 402    | `insufficient_funds`     | Your available credits don't cover it                              |
| 403    | `wallet_frozen`          | Your wallet or the recipient's is frozen                           |
| 404    | `not_found`              | Not your conversation, or the wallet is off                        |
| 409    | `invalid_state`          | "Payments are only available in direct messages" (channels)        |
| 409    | `conflict`               | Busy (concurrent writes on Sanity); retry with the same key        |
| 422    | `idempotency_key_reused` | The key was used for a different payment                           |
| 422    | `limit_exceeded`         | The demo store is full                                             |
| 429    | `rate_limited`           | More than 12 money operations in a minute (shared with the wallet) |
| 503    | `service_unavailable`    | The wallet needs `SANITY_API_TOKEN` on this deployment             |

### `POST /api/conversations/:id/requests`

Asks the other member to pay you `amount` credits and posts the request in
the conversation, in one write. The payer pays or declines, and the
requester cancels, through the wallet's request endpoints
(`/api/wallet/requests/:id/pay`, `/decline`, `/cancel`); the bubble shows
the new status on both members' next read. `Location` is the request.

The errors are the payment's, without 402, plus 422 `limit_exceeded` when
you already have 10 pending requests.

Payments and requests move the wallet's credits, so they also need the
`wallet` feature: while it is off (`DISABLED_FEATURES=wallet`) both answer
404 "This feature is turned off", and 503 while it is unconfigured, like the
wallet's own routes. Nothing moves and nothing is posted. Text messages and
reading are unaffected; existing payment and request messages still show.

### `PUT /api/conversations/:id/read`

Marks the conversation read up to now for the current user (204). The
marker only moves forward. Members only (404 for everyone else).

## Limits

- Messages: up to 1,000 characters; 30 sends a minute per user.
- Payments and requests in chat: 0.50–200.00 credits, notes up to 100
  characters, and the wallet's limits (12 money operations a minute, at
  most 10 pending requests of your own).
- The in-memory demo store keeps the newest 20,000 text messages and drops
  older ones first; retrying the key of a dropped message posts it again.
  Payments and requests are never dropped.
- `READ_ONLY=true` turns every write above into 403 `read_only`.

## Storage and privacy

On Sanity, conversations, memberships and messages are private documents
(`private.` ids) that need a token to read: without `SANITY_API_TOKEN` the
feature is unconfigured and these endpoints answer 503. Direct messages are
**not encrypted**: anyone with access to the dataset can read them. The
Studio never lists direct conversations, but that is a convenience, not a
protection. Unread counts and last messages are computed when read, so
sending a message writes only the message (and, for money, its transfer or
request).
