# Channels API

Public group conversations. A channel is a conversation of the
[messages engine](messages.md) with the id `channel-<handle>`: anyone can
read it, members post in it, and its owner and moderators keep it tidy.
Channels have no payments: those stay in direct messages.

These endpoints belong to the `channels` feature, and so does a channel's
conversation wherever the engine serves it: while channels are off
(`DISABLED_FEATURES=channels`) `/api/conversations/channel-<handle>/messages`
answers 404 "This feature is turned off" too (503 while unconfigured), so
there is no way round the switch. They follow the
[SuperApp conventions](../API.md#superapp-conventions): the acting user
always comes from the server (bodies never name the owner, author or
member; such fields are ignored), sends need an `Idempotency-Key`, and
writes answer 403 `read_only` on a read-only deployment.

| Method & path                                      | Request                                         | Success                                               |
| -------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| `GET /api/channels`                                | `?q=` (≤100 characters), `member=true`          | `200 { items }`                                       |
| `POST /api/channels`                               | `{ "handle", "name", "description"? }`          | `201 { channel }` + `Location`                        |
| `GET /api/channels/:handle`                        | —                                               | `200 { channel }`                                     |
| `PUT /api/channels/:handle/membership`             | — (join)                                        | `200 { channel }`                                     |
| `DELETE /api/channels/:handle/membership`          | — (leave)                                       | `200 { channel }`                                     |
| `GET /api/channels/:handle/members`                | —                                               | `200 { items: [{ user, role }] }`                     |
| `PUT /api/channels/:handle/members/:username/role` | `{ "role": "moderator" or "member" }`           | `200 { channel }`                                     |
| `GET /api/channels/:handle/messages`               | `?before=` or `?after=` cursor, `limit=1..50`   | `200 { items, olderCursor, newestCursor, serverNow }` |
| `POST /api/channels/:handle/messages`              | key; `{ "text": 1..1000 or "" with "tweetId" }` | `201 { message }`                                     |
| `DELETE /api/channels/:handle/messages/:messageId` | —                                               | `204`                                                 |
| `PUT /api/channels/:handle/read`                   | —                                               | `204`                                                 |

"key" means the `Idempotency-Key` header is required. Response types are in
`types/Message.ts`. A `:handle` is matched in lower case
(`/api/channels/Ankara_Eats` is `#ankara_eats`); anything that can't be a
handle is a 404.

## Objects

### Channel

```json
{
  "id": "channel-ankara_eats",
  "kind": "channel",
  "handle": "ankara_eats",
  "name": "Ankara eats",
  "description": "Favourite spots, new menus and late-night food around Ankara.",
  "owner": {
    "username": "foodie_ankara",
    "fullname": "Mert Demir",
    "image": "/avatars/foodie_ankara.svg"
  },
  "memberCount": 4,
  "lastMessage": { "…": "a message" },
  "createdAt": "2026-10-08T12:00:00.000Z",
  "viewer": { "role": null, "unread": 0 }
}
```

- `handle` is 3 to 30 lower-case letters, digits or `_`. It is the
  channel's id, so it never changes.
- `viewer.role` is yours: `"owner"`, `"moderator"`, `"member"`, or `null`
  when you haven't joined. `viewer.unread` counts the messages others wrote
  since you last read the channel (always 0 for non-members).
- `memberCount` and `lastMessage` are computed when read.

### Messages

Channel messages are the [messages API's message objects](messages.md#message),
with `conversationId` `channel-<handle>`. Channels hold text and shared
Tweets only. A deleted message keeps its author and time, and its body
becomes `{ "type": "removed", "by": "author" }` ("Message deleted") or
`{ "type": "removed", "by": "moderator" }` ("Message removed by a
moderator") for everyone.

## Reading

Reading is public: every channel, its members and its messages can be read
without joining.

### `GET /api/channels`

Without `member`, every channel (Discover), the most members first, ties by
handle. With `member=true`, only yours, the most recently active first. `q`
keeps the channels whose handle, name or description has words starting
with every word of the query (like Tweet search). At most 100 channels.

### `GET /api/channels/:handle/members`

The owner, then moderators, then members, each by username. At most 200.

### `GET /api/channels/:handle/messages`

Pages exactly like a conversation's
([`GET /api/conversations/:id/messages`](messages.md#get-apiconversationsidmessages)).
The app polls the newest page every 4 s while a channel is open, merged by
id, so a message removed meanwhile shows as removed.

## Writing

### `POST /api/channels`

Creates a channel that you own. `name` (1–50 characters) and `description`
(up to 160, blank is none) are sanitized like Tweet text. There is no key:
the handle makes the channel unique, so a retry of a request that already
succeeded answers 409.

| Status | `code`             | When                                                     |
| ------ | ------------------ | -------------------------------------------------------- |
| 400    | `validation_error` | Bad `handle`, `name` or `description` (`details` say so) |
| 409    | `conflict`         | "That handle is taken"                                   |
| 422    | `limit_exceeded`   | "You can create up to 3 channels"                        |
| 429    | `rate_limited`     | More than 5 attempts an hour                             |

A handle is taken exactly once, even by concurrent requests. The 3-channel
limit is exact in memory; on Sanity it is checked just before the write, so
two creates at the same instant could pass it together (the hourly budget
bounds that).

### `PUT` and `DELETE /api/channels/:handle/membership`

Joins or leaves. Both are idempotent: repeating one answers 200 with the
channel as it is. Joining marks everything so far as read. The owner can't
leave (409 `invalid_state`, "The owner can't leave their channel"); a
moderator who leaves and joins again is a member.

### `PUT /api/channels/:handle/members/:username/role`

The owner makes a member a moderator, or a moderator a member again. The
response is the channel as the owner sees it.

| Status | `code`             | When                                                                   |
| ------ | ------------------ | ---------------------------------------------------------------------- |
| 400    | `validation_error` | `role` isn't `"moderator"` or `"member"`                               |
| 403    | `forbidden`        | You aren't the owner, or `:username` is the owner (that role is fixed) |
| 404    | `not_found`        | No such channel, or `:username` isn't a member                         |

### `POST /api/channels/:handle/messages`

Posts a message, for members only. The body, the key and replays work like
[a conversation's](messages.md#post-apiconversationsidmessages) (30 sends a
minute per person, shared with direct messages). `storyId` isn't accepted
here, nor through `POST /api/conversations/channel-<handle>/messages`, which
drops it so both routes make the same send: story replies are direct
messages.

| Status | `code`                   | When                                     |
| ------ | ------------------------ | ---------------------------------------- |
| 400    | `validation_error`       | Bad `text`, `tweetId` or key             |
| 403    | `forbidden`              | "Join this channel to send messages"     |
| 404    | `not_found`              | No such channel or Tweet                 |
| 422    | `idempotency_key_reused` | The key was used for a different message |
| 429    | `rate_limited`           | More than 30 messages in a minute        |

### `DELETE /api/channels/:handle/messages/:messageId`

Deletes a message of this channel: its author deletes their own (it reads
"Message deleted"), and the owner and moderators delete anyone's ("Message
removed by a moderator"). Deleting a message that is already deleted
changes nothing and answers 204 again. 403 `forbidden` for anyone else;
404 for a message of another channel, a direct message or an unknown id.
The text stays in the dataset for moderators (Studio's "Removed messages").

### `PUT /api/channels/:handle/read`

Marks the channel read up to now for a member (the marker only moves
forward). For someone who hasn't joined it changes nothing; it still
answers 204.

### Payments

`POST /api/conversations/channel-<handle>/payments` and `/requests` answer
409 `invalid_state`, "Payments are only available in direct messages".

## Limits

- Each person creates at most 3 channels, and makes at most 5 attempts an
  hour.
- Names up to 50 characters, descriptions up to 160, messages up to 1,000.
- Lists return at most 100 channels and 200 members.
- `READ_ONLY=true` turns every write above into 403 `read_only`.

## Storage and privacy

On Sanity a channel is a private `conversation` document
(`private.channel-<handle>`), next to its memberships and messages, so
reading channels needs a token: without `SANITY_API_TOKEN` the feature is
unconfigured and these endpoints answer 503. The app shows channels to
everyone; the dataset doesn't. Studio lists channels (name and description
are editable there) and removed messages under "Channels".
