# Messages

Direct conversations between two people, with payments, payment requests
and shared Tweets inside them. The data and the
[messages API](../api/messages.md) are in place: conversations, paging,
read markers, payments and requests that are written together with their
message, a business's automatic greeting, the demo conversations, and the
Messages badge (conversations with unread messages). The inbox and
conversation pages come with the rest of the `messages` PR, which describes
them here: where the feature lives in the app, its empty, loading, error and
read-only states, and how to try it. Until then `/messages` shows its
placeholder.

## Demo data

The demo user starts with four conversations:

- **Sarah Chen**: Friday coffee, then her request for 4.50 credits for
  "Coffee ☕" (`seed-req01`), still pending and unread. This is the badge's 1.
- **Marco Rossi**: his 15.00 credits "Thanks for the code review 🙏"
  (`seed-tx03`) and a reply. Marco has read it.
- **Kızılay Kahve**: the café's automatic greeting, a question about oat
  milk and its answer.
- **Ayşe Yılmaz**: the demo user's request for "Design sprint pizza 🍕"
  (`seed-req02`), paid, and her thanks.

## Limits

Messages are up to 1,000 characters (30 a minute per person). Payments and
requests in chat follow the wallet's limits. The in-memory demo store keeps
the newest 20,000 text messages; payments and requests are never dropped.

How SuperApp features are built is in [docs/SUPERAPP.md](../SUPERAPP.md).
