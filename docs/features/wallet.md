# Wallet

The foundation already ships the wallet's core: the demo-credit ledger, the
[wallet API](../api/wallet.md), your balance on `/wallet` and in the Services
and sidebar cards, activity with receipts (`/wallet/transactions/<id>`), and
notifications for tips, payments and payment requests. Every balance is in
demo credits, which have no cash value.

The `wallet` PR adds the controls and describes the feature here: sending,
requesting and adding credits, paying and declining requests, tipping
Tweets, where each lives in the app, its states, its limits, and how to try
it with the demo data.

How the ledger works is in [docs/SUPERAPP.md](../SUPERAPP.md#ledger-and-holds).
