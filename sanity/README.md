# Twitter SuperApp: Sanity Studio

The content backend for the app, built with [Sanity Studio](https://www.sanity.io/docs/sanity-studio) v6.
It edits the same documents the app reads and writes when `DATA_SOURCE=sanity`.

## Run it

Requires Node.js 22.20 or newer.

```bash
cd sanity
npm ci
npm run dev        # http://localhost:3333
```

| Script                         | What it does                                 |
| ------------------------------ | -------------------------------------------- |
| `npm run dev` (or `npm start`) | Studio with hot reload                       |
| `npm run build`                | Production build into `dist/`                |
| `npm run preview`              | Serves the build from `npm run build`        |
| `npm run deploy`               | Deploys the Studio to `<name>.sanity.studio` |
| `npm run typecheck`            | TypeScript check of config and schemas       |
| `npx sanity schema validate`   | Validates the schema without network access  |

The project id and dataset default to the original project (`am1ac7lm` / `production`).
Override them with `SANITY_STUDIO_PROJECT_ID` and `SANITY_STUDIO_DATASET` (see `.env.example`).

## Content model

| Type                          | Purpose                                               | Notes                                                                                                                                 |
| ----------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `tweet`                       | A tweet: text up to 280 characters, optional image    | Author fields are denormalized on the tweet. `blockTweet` hides it everywhere. `attachment` links a product card                      |
| `comment`                     | A reply to a tweet (shown as "Replies")               | Strong reference to its tweet                                                                                                         |
| `user`                        | Profile: name, avatar, header, bio, location, website | `username` is unique (case-insensitive) and can't be an app page (`wallet`, `services`, …). `accountType` is personal or business     |
| `like`, `retweet`, `bookmark` | One document per (tweet, user)                        | Created by the app with ids like `like-<tweetId>-<username>`, so reacting is idempotent. Weak references never block deleting a tweet |

Field names of `tweet` and `comment` are unchanged from the v2 Studio, so existing documents keep working.
Only the input types (`string` → `text`/`url`) and the validation changed, and both types store plain strings.
`comment.likes` was never used; it is now hidden and marked deprecated.

The **Blocked tweets** list in the desk is a moderation view of tweets with `blockTweet == true`.

### SuperApp types

The SuperApp's documents are listed under the **SuperApp** divider in the
desk, grouped as Money, Food, Rides, Stories and Channels. A group appears
once its feature has shipped. Amounts are integer cents of demo credits
(`450` is 4.50 credits), which have no cash value.

| Type              | What it is                                                                | In the Studio                                      |
| ----------------- | ------------------------------------------------------------------------- | -------------------------------------------------- |
| `wallet`          | One balance per user (`private.wallet-<username>`)                        | **Locked**: read-only, no actions. Desk: Wallets   |
| `transfer`        | One movement of demo credits; only its refund is ever recorded on it      | **Locked**. Desk: Transfers                        |
| `paymentRequest`  | A request for credits, paid or declined in the app                        | **Locked**. Desk: Payment requests                 |
| `walletFreeze`    | Stops a wallet sending and receiving (refunds pass)                       | **Live-edited**, all actions. Desk: Frozen wallets |
| `businessProfile` | Menu-side details of a business account (hours, fees, greeting, managers) | **Live-edited**. Desk: Businesses                  |

The feature PRs add `product`, `order`, `driverProfile`, `ride`,
`driverLock`, `story`, `storyView`, `conversation`, `conversationMember` and
`message` the same way (see [docs/SUPERAPP.md](../docs/SUPERAPP.md#studio)).

What the three Studio rules mean:

- **Locked** types are written only by the app, which keeps balances and the
  transfers that explain them consistent in one transaction. They are
  read-only, have no document actions (no publish, delete, duplicate or
  unpublish) and are never offered in a "Create" menu. Publishing a Studio
  draft of a wallet would overwrite a newer balance.
- **Moderated** types (stories, channels, messages) are created by the app;
  a moderator may only change the fields left open (such as a story's
  `blocked` or a message's `removed`) and publish them. No create,
  duplicate or delete.
- **Live-edited** types (`walletFreeze`, `businessProfile`, and later
  `product` and `driverProfile`) have no drafts: every change is published
  as you type. The app patches some of their fields itself (a business's
  "Accepting orders" switch, a product's availability), and a later publish
  of an older draft would undo those changes.

### Moderation

- **Freeze a wallet** by creating a document in **Frozen wallets** with the
  `username` and, optionally, a reason. The reason is visible to anyone who
  can read the dataset. A frozen wallet can't send, tip, top up, pay, order,
  book or receive; refunds still go through in both directions. Delete the
  document to unfreeze it. The app checks for a freeze just before each
  payment, so one payment already in progress can still complete.
- **Make an account a business** by setting the user's account type to
  "Business" and creating its profile in **Businesses** with the same
  username. The app ignores a profile whose user isn't a business. The
  business's name and avatar always come from its user document.
- Wallets and transfers are never edited by hand. To give someone credits,
  use the app (top-ups) so the ledger stays consistent.

## Privacy

Wallets, transfers, payment requests, orders, rides, story views and
conversations are **private documents**: their ids start with `private.`,
and Sanity never returns documents under such a path to a request without a
token, even from a public dataset. The app reads and writes them with
`SANITY_API_TOKEN` through a `raw`-perspective client.

- **Direct messages are stored unencrypted.** Anyone with access to the
  dataset (project members, Vision, any token with read access) can read
  them. The desk never lists direct conversations, but that is a
  convenience, not a protection.
- **Private data needs a token.** Without one the app hides the private
  features (their API answers 503), and anonymous visitors can't read those
  documents.
- **Verify a dataset** from the repository root with
  `npm run check:sanity-privacy`. It queries the configured project
  anonymously, by type and by `private.` path, and fails if anything comes
  back.
- If a Studio version hides path documents from its lists, **Vision** (the
  GROQ tool in the Studio) still shows them, for example
  `*[_id in path("private.**") && _type == "transfer"]`.

The app checks the ledger's invariants (balances match transfers, nothing
negative, refunds at most once) with `npm run audit:ledger`, which needs the
token too.

## Demo content

The app ships the same demo data it uses in memory. To load it into a dataset:

```bash
# from the repository root
npm run seed:sanity
cd sanity && npx sanity dataset import seed/demo.ndjson production --missing
```

`--missing` only creates documents that do not exist yet. Use `--replace` to overwrite them.

The export includes private documents (`private.*` ids: wallets, transfers,
payment requests). **Importing them needs a token**: the CLI uses your
`npx sanity login` session, or set `SANITY_AUTH_TOKEN` to a token with write
access. Import into a fresh dataset, or one the app hasn't written to: the
seeded wallets only match the seeded transfers.
