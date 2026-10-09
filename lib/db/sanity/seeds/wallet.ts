import { SeedData } from "../../seed";
import { privateId, walletKey } from "../ids";
import { paymentRequestDocument, transferDocument } from "../walletDocuments";
import { SanitySeedDocument } from "./documents";

// Wallets, transfers and payment requests are private: path ids, so they
// need a token to read or import (see sanity/README.md).

export function walletSanityDocuments(seed: SeedData): SanitySeedDocument[] {
  const wallet = seed.superapp?.wallet;
  if (!wallet) return [];

  // A wallet document is dated by the transfers that touched it.
  const touched = new Map<
    string,
    { username: string; first: string; last: string }
  >();
  for (const transfer of wallet.transfers) {
    for (const author of [transfer.from, transfer.to]) {
      if (!author) continue;
      const key = author.username.toLowerCase();
      const seen = touched.get(key);
      touched.set(key, {
        username: seen?.username ?? author.username,
        first: seen?.first ?? transfer.createdAt,
        last: transfer.createdAt,
      });
    }
  }

  const wallets = [...touched].map(([key, { username, first, last }]) => ({
    _id: privateId(walletKey(key)),
    _type: "wallet",
    _createdAt: first,
    username,
    key,
    balance: wallet.balances[key] ?? 0,
    createdAt: first,
    updatedAt: last,
  }));

  return [
    ...wallets,
    ...wallet.transfers.map((transfer) => ({
      ...transferDocument(transfer),
      _createdAt: transfer.createdAt,
    })),
    ...wallet.requests.map((request) => ({
      ...paymentRequestDocument(request),
      _createdAt: request.createdAt,
    })),
  ];
}
