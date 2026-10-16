# Stories API

A story is a short text on a coloured background, or a photo with alt text
and an optional caption, that disappears 24 hours after it is posted. Home
shows them in a tray of accounts; anyone can watch them, only the author
sees who did.

These endpoints belong to the `stories` feature. They follow the
[SuperApp conventions](../API.md#superapp-conventions): writes keep the
same-origin check, the per-client write limit and `READ_ONLY`, and records
only their author may see answer 404 to everyone else. Stories move no
credits, so no endpoint takes an `Idempotency-Key`.

| Method & path                  | Request                                                                                        | Success                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------- | ---------------------------- |
| `GET /api/stories/tray`        | —                                                                                              | `200 { items }`              |
| `GET /api/stories`             | `?author=username`                                                                             | `200 { items }`              |
| `POST /api/stories`            | `{ "content": text story }` (text ≤200 + background) or image story (alt 1..420, caption ≤100) | `201 { story }` + `Location` |
| `GET /api/stories/:id`         | —                                                                                              | `200 { story }`              |
| `DELETE /api/stories/:id`      | —                                                                                              | `204`                        |
| `POST /api/stories/views`      | `{ "ids": [1..50 story ids] }`                                                                 | `204`                        |
| `GET /api/stories/:id/viewers` | —                                                                                              | `200 { items }`              |

Response types are in `types/Story.ts`, with the objects.

## Objects

### Story

```json
{
  "id": "seed-story07",
  "author": {
    "username": "illlhanozkan",
    "fullname": "Ilhan Ozkan",
    "image": "/avatars/illlhanozkan.svg"
  },
  "content": {
    "type": "text",
    "text": "Building the SuperApp in public 🚀",
    "background": "green"
  },
  "createdAt": "2026-10-14T06:00:00.000Z",
  "expiresAt": "2026-10-15T06:00:00.000Z",
  "viewer": { "seen": false },
  "views": 3
}
```

| Field       | Meaning                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| `content`   | `{ "type": "text", "text", "background" }` or `{ "type": "image", "image", "alt", "caption" }` (`caption` may be `null`) |
| `expiresAt` | Exactly 24 hours after `createdAt`. From then on the story is gone: every endpoint treats it as unknown                  |
| `viewer`    | `seen`: whether the current user has watched it                                                                          |
| `views`     | How many people other than the author watched it, on the author's own stories only; `null` for everyone else             |

`background` is one of six colours, each at least 5:1 against white text:

| `background` | Colour    |
| ------------ | --------- |
| `blue`       | `#1570c2` |
| `purple`     | `#6d28d9` |
| `green`      | `#047857` |
| `orange`     | `#b45309` |
| `pink`       | `#be185d` |
| `slate`      | `#334155` |

### Tray item

One per account with stories showing:

```json
{
  "author": {
    "username": "foodie_ankara",
    "fullname": "Mert Demir",
    "image": "/avatars/foodie_ankara.svg"
  },
  "storyIds": ["seed-story03", "seed-story04"],
  "latestAt": "2026-10-14T10:00:00.000Z",
  "hasUnseen": true,
  "firstUnseenId": "seed-story03",
  "unseenIds": ["seed-story03", "seed-story04"]
}
```

`storyIds` are oldest first, the order they play in; `unseenIds` are those
the current user hasn't seen (the tray's "2 new"), also oldest first.
`firstUnseenId` is the first of them, where the viewer should start (`null`
when every story was seen), and `latestAt` is when the newest was posted. A
later story can be seen before an earlier one (a link can open any story),
so the unseen ones aren't always the last ones.

## Reading

### `GET /api/stories/tray`

The tray on Home, for the current user: their own stories first ("Your
story"), then accounts with stories they haven't seen, then the rest, each
group with the most recent poster first. At most 50 accounts.

### `GET /api/stories?author=username`

The author's stories that are showing, oldest first. An account with nothing
posted answers `{ "items": [] }`; an unknown username is a 404, and an
invalid one a 400.

### `GET /api/stories/:id`

One story. Unknown ids, expired stories and stories a moderator blocked all
answer 404 `not_found` "Story not found".

### `GET /api/stories/:id/viewers`

Who watched the story, most recent first, never counting the author:

```json
{
  "items": [
    {
      "username": "superapp",
      "fullname": "Twitter SuperApp",
      "image": "/avatars/superapp.svg"
    }
  ]
}
```

Only the author may ask: for everyone else, as for unknown, expired or
blocked stories, the answer is 404.

## Writing

### `POST /api/stories`

Posts a story as the current user. The `Location` header is the story.

```sh
curl -X POST http://localhost:3000/api/stories \
  -H 'Content-Type: application/json' \
  -d '{ "content": { "type": "text", "text": "Lahmacun crawl tonight 🌯", "background": "orange" } }'
```

```json
{
  "content": {
    "type": "image",
    "image": "https://example.com/sunset.jpg",
    "alt": "A sunset over the bay",
    "caption": "Golden hour"
  }
}
```

- `text` is 1–200 characters; `alt` 1–420 and `caption` up to 100 (a blank
  caption is stored as `null`). All are sanitized like Tweet text and counted
  in code points.
- `image` follows the rule for Tweet images: an `https://` URL or a path on
  this site such as `/media/coffee.svg`.
- Alt text is required: it is what screen readers say instead of the photo.

| Status | `code`             | When                                                                  |
| ------ | ------------------ | --------------------------------------------------------------------- |
| 400    | `validation_error` | Bad `content` (`details[0].path` names the field, e.g. `content.alt`) |
| 422    | `limit_exceeded`   | You already have 10 stories showing                                   |
| 429    | `rate_limited`     | More than 10 new stories in an hour (the `stories` budget)            |

Stories a moderator blocked don't count towards the 10. Posting also deletes
your expired stories and their views, so nothing has to clean up in the
background. On Sanity the limit is checked when the story is posted, so two
posted at the same instant can both get through.

### `DELETE /api/stories/:id`

Deletes one of your stories, with its views. Someone else's story is a 403
`forbidden` ("You can only delete your own stories"); unknown, expired and
blocked ones are 404.

### `POST /api/stories/views`

Marks up to 50 stories as seen by the current user, as the viewer does every
few seconds while you watch. It answers 204, and is idempotent: a story seen
twice is recorded once, with the first time. Unknown, expired and blocked
ids are ignored. `ids` must be a list of 1–50 story ids (400 otherwise).

On a `READ_ONLY` deployment this is a 403 like every write; the viewer keeps
what you have seen in the browser instead. On Sanity without a token it is a
503 `service_unavailable`: the viewer stops reporting for the rest of the
page's life (rings still grey until a reload) rather than retry what can't
succeed. It does retry a batch lost to a network error, a 429 or another 5xx.

### Replies

A reply to a story is a direct message to its author, sent through the
[Messages API](messages.md): `POST /api/conversations { "with": author }`
opens (or finds) the conversation, then
`POST /api/conversations/:id/messages { "text", "storyId" }` sends the text
with the story attached (an `Idempotency-Key` makes a retry safe). The
message keeps a preview of the story until it expires. The viewer offers
replies only while the `messages` feature is on and the deployment is
writable.

## Moderation and storage

On Sanity, stories are public `story` documents (readable without a token;
writes need one) and views are private `storyView` documents under
`private.` ids, so without a token nobody has seen anything. In Studio a
moderator can only block or unblock a story: blocking hides it everywhere at
once. The memory store keeps at most 2,000 stories (expired ones are dropped
first, then the oldest) and 20,000 views (oldest first).

The demo's seeded stories all disappear 24 hours after they are seeded,
whatever their age. On the memory store that is when the server starts, and
restarting it brings them back. On Sanity it is when `npm run seed:sanity`
exported them (their `expiresAt` is stored), so restarting changes nothing
and importing again with `--missing` skips them. To bring them back, delete
the seeded story documents, then export and import again:

```bash
# from the repository root
cd sanity && npx sanity documents delete seed-story01 seed-story02 \
  seed-story03 seed-story04 seed-story05 seed-story06 seed-story07 && cd ..
npm run seed:sanity
cd sanity && npx sanity dataset import seed/demo.ndjson production --missing
```

`--replace` instead of `--missing` works too, but it resets every seeded
document, wallets included (see [sanity/README.md](../../sanity/README.md)).
