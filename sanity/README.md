# Twitter SuperApp: Sanity Studio

The content backend for the app, built with [Sanity Studio](https://www.sanity.io/docs/sanity-studio) v6.
It edits the same documents the app reads and writes when `DATA_SOURCE=sanity`.

## Run it

Requires Node.js 22.12 or newer.

```bash
cd sanity
npm ci
npm run dev        # http://localhost:3333
```

| Script                       | What it does                                 |
| ---------------------------- | -------------------------------------------- |
| `npm run dev`                | Studio with hot reload                       |
| `npm run build`              | Production build into `dist/`                |
| `npm run deploy`             | Deploys the Studio to `<name>.sanity.studio` |
| `npm run typecheck`          | TypeScript check of config and schemas       |
| `npx sanity schema validate` | Validates the schema without network access  |

The project id and dataset default to the original project (`am1ac7lm` / `production`).
Override them with `SANITY_STUDIO_PROJECT_ID` and `SANITY_STUDIO_DATASET` (see `.env.example`).

## Content model

| Type                          | Purpose                                               | Notes                                                                                                                                 |
| ----------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `tweet`                       | A tweet: text up to 280 characters, optional image    | Author fields are denormalized on the tweet. `blockTweet` hides it everywhere                                                         |
| `comment`                     | A reply to a tweet (shown as "Replies")               | Strong reference to its tweet                                                                                                         |
| `user`                        | Profile: name, avatar, header, bio, location, website | `username` is unique (case-insensitive)                                                                                               |
| `like`, `retweet`, `bookmark` | One document per (tweet, user)                        | Created by the app with ids like `like-<tweetId>-<username>`, so reacting is idempotent. Weak references never block deleting a tweet |

Field names of `tweet` and `comment` are unchanged from the v2 Studio, so existing documents keep working.
Only the input types (`string` → `text`/`url`) and the validation changed, and both types store plain strings.
`comment.likes` was never used; it is now hidden and marked deprecated.

The **Blocked tweets** list in the desk is a moderation view of tweets with `blockTweet == true`.

## Demo content

The app ships the same demo data it uses in memory. To load it into a dataset:

```bash
# from the repository root
npm run seed:sanity
cd sanity && npx sanity dataset import seed/demo.ndjson production --missing
```

`--missing` only creates documents that do not exist yet. Use `--replace` to overwrite them.
