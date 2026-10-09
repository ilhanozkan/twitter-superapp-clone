import { IAuthor } from "../../../../types/User";
import { ITransfer } from "../../../../types/Wallet";
import { SeedData } from "../../seed";
import { privateId, walletKey } from "../ids";
import { compact, SanitySeedDocument } from "./documents";

// Wallets and transfers are private: path ids, so they need a token to read
// or import (see sanity/README.md).

const party = (author: IAuthor | null) =>
  author
    ? compact({
        username: author.username,
        fullname: author.fullname,
        image: author.image,
      })
    : null;

export function transferDocument(transfer: ITransfer): SanitySeedDocument {
  return compact({
    _id: privateId(transfer.id),
    _type: "transfer",
    _createdAt: transfer.createdAt,
    kind: transfer.kind,
    amount: transfer.amount,
    from: party(transfer.from),
    fromKey: transfer.from?.username.toLowerCase() ?? null,
    to: party(transfer.to),
    toKey: transfer.to.username.toLowerCase(),
    note: transfer.note,
    context: transfer.context ? compact({ ...transfer.context }) : null,
    holdUntil: transfer.holdUntil,
    reversedBy: transfer.reversedBy,
    reverses: transfer.reverses,
    createdAt: transfer.createdAt,
  });
}

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
    updatedAt: last,
  }));

  return [...wallets, ...wallet.transfers.map(transferDocument)];
}
