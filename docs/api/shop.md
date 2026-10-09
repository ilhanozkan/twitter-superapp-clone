# Businesses and menus API

Ships in the `business` PR, which documents `/api/businesses/**` and
`/api/products/**` here. Until then these endpoints answer 404 and
`GET /api/me` reports the feature as off.

The shared rules (amounts, idempotency, per-user limits, visibility, feature
switches) are in [the API conventions](../API.md#superapp-conventions).
