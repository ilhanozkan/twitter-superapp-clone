# Stories

Short texts and photos that disappear after 24 hours. The `stories` PR
describes the feature here: the story tray on Home, the viewer, the composer,
viewers and replies; where it lives in the app; its empty, loading, error and
read-only states; its limits; and how to try it with the demo data.

The data and the API come first and are on: stories are stored in both data
sources, seeded for six accounts, and served by `/api/stories/**`. The tray,
the viewer and the composer follow in the same PR.

How SuperApp features are built is in [docs/SUPERAPP.md](../SUPERAPP.md); the
API is in [docs/api/stories.md](../api/stories.md).
