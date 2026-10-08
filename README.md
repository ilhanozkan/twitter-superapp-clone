# Twitter SuperApp

## App Mission

This app aims to Twitter become a SuperApp.

## Overview

![Overview](./@readme-images/overview.png)

## Getting started

Requires Node.js 22.12 or newer (see `.nvmrc`).

```bash
npm ci
npm run dev   # http://localhost:3000
```

No configuration is needed: without Sanity credentials the app runs on a bundled
in-memory demo dataset (8 users, 20 tweets, replies, likes, retweets and bookmarks).
Changes you make are kept until the server restarts.

### Scripts

| Script                | What it does                                           |
| --------------------- | ------------------------------------------------------ |
| `npm run dev`         | Development server                                     |
| `npm run build`       | Production build                                       |
| `npm start`           | Serves the production build                            |
| `npm run typecheck`   | TypeScript check                                       |
| `npm test`            | Unit and repository contract tests (Vitest)            |
| `npm run seed:sanity` | Exports the demo dataset as NDJSON for a Sanity import |

## Data

All reads and writes go through one repository interface (`lib/db/types.ts`) with two
implementations, chosen by `DATA_SOURCE` (see `.env.example`):

| Source   | When it is used                             | Notes                                                                               |
| -------- | ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `memory` | Default when `SANITY_PROJECT_ID` is not set | Seeded from `lib/db/seed.ts`. Per process, so not for serverless production         |
| `sanity` | Default when `SANITY_PROJECT_ID` is set     | Reads without the CDN so new tweets show up at once. Writes need `SANITY_API_TOKEN` |

The same contract test suite (`lib/db/repository.contract.test.ts`) runs against both:
the Sanity implementation executes its real GROQ queries with
[groq-js](https://github.com/sanity-io/groq-js), and a final test checks that both return
the same results for the same reads. Search works like GROQ's `match` in both: every word
of the query must start a word in the tweet, the username or the name.

The Sanity Studio lives in [`sanity/`](./sanity/README.md).

## API

The app talks to a small REST API under `/api` (tweets, replies, likes,
retweets, bookmarks, users, notifications, trends). Every request acts as the
account in `DEMO_USERNAME`, decided on the server; writes are validated, rate
limited and same-origin only. See [docs/API.md](./docs/API.md).

> There is no sign-in yet, so every visitor acts as `DEMO_USERNAME`. For a
> public deployment backed by Sanity with a write token, set `READ_ONLY=true`.

## Features

### Todos

- [ ] Twitter accounts have balance.
- [ ] Orders can be made via Tweets.
- [ ] Payment can be made via Twitter chat.
- [ ] Business account type created for businesses.
- [ ] Food delivery and ordering services created.
- [ ] Trips can be made with a driver booking (like Uber).
- [ ] Users can create stories (like Twitter Fleets).
- [ ] Live broadcasts are possible (like TikTok, Instagram, Twitch).
- [ ] Group chat channels added (like Discord, Telegram).
