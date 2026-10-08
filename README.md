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

| Script                | What it does                                                 |
| --------------------- | ------------------------------------------------------------ |
| `npm run dev`         | Development server                                           |
| `npm run build`       | Production build                                             |
| `npm start`           | Serves the production build                                  |
| `npm run lint`        | ESLint (Next.js core web vitals + TypeScript rules)          |
| `npm run format`      | Prettier (with Tailwind class sorting); `format:check` in CI |
| `npm run typecheck`   | TypeScript check                                             |
| `npm test`            | Unit, component and repository contract tests (Vitest)       |
| `npm run test:e2e`    | End-to-end tests (Playwright) against `npm run build` output |
| `npm run seed:sanity` | Exports the demo dataset as NDJSON for a Sanity import       |

The first `npm run test:e2e` needs a browser: `npx playwright install chromium`.

## Frontend

Next.js 16 (pages router) with React 19, Redux Toolkit and Tailwind CSS.

- Every page renders on the server: `getServerSideProps` reads the repository directly
  (`lib/server/pageState.ts`) and hands the data to the Redux store as `initialState`,
  so the first paint already contains the timeline.
- Client-side changes go through the REST API with optimistic updates: likes, Retweets
  and bookmarks flip immediately and roll back if the request fails.
- Pages: Home, Explore and search, Notifications, Bookmarks, profiles (`/[username]`,
  with a Likes tab), a tweet's own page with replies (`/[username]/status/[id]`), Lists
  and Messages (roadmap placeholders), and custom 404/500 pages.

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
