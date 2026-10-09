import { isCents } from "../../superapp/money";
import { Cents } from "../../../types/Money";
import { IAuthor } from "../../../types/User";
import { ITransfer } from "../../../types/Wallet";
import { SeedContext, SeedContribution, SeedTransfer } from "./types";

/** The wallet world: every lane's transfers, folded into balances. */
export interface WalletSeed {
  /** Oldest first; a held credit that was refunded names its refund in `reversedBy`. */
  transfers: ITransfer[];
  /** Balance per lower-case username after every transfer. */
  balances: Record<string, Cents>;
}

/** F's announcement of the wallets, with Sarah's reply. */
export function createWalletSeed({ at }: SeedContext): {
  data: null;
  contribution: SeedContribution;
} {
  return {
    data: null,
    contribution: {
      tweets: [
        {
          id: "seed-t21",
          text: "Wallets are live 💸 Every account gets demo credits to tip Tweets, pay friends in Messages, order food and book rides. Open Services to try it. #SuperApp",
          image: null,
          createdAt: at(30),
          author: "superapp",
          blocked: false,
        },
      ],
      replies: [
        {
          id: "seed-r12",
          tweetId: "seed-t21",
          text: "Tipped my first Tweet. Weirdly satisfying.",
          createdAt: at(20),
          author: "sarahcodes",
        },
      ],
    },
  };
}

const byTime = (a: SeedTransfer, b: SeedTransfer) =>
  Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Folds the transfers every lane contributed, in time order, into balances.
 * A seed that would overdraw a wallet or reverse a transfer twice is a bug
 * in that lane's seed, so it throws.
 */
export function composeWalletSeed(
  transfers: SeedTransfer[],
  authorOf: (username: string) => IAuthor
): WalletSeed {
  const balances: Record<string, Cents> = {};
  const records = new Map<string, ITransfer>();

  for (const transfer of [...transfers].sort(byTime)) {
    if (!isCents(transfer.amount) || transfer.amount === 0) {
      throw new Error(`Seed transfer "${transfer.id}" has an invalid amount`);
    }
    if (records.has(transfer.id)) {
      throw new Error(`Seed transfer "${transfer.id}" is not unique`);
    }

    if (transfer.reverses) {
      const original = records.get(transfer.reverses);
      if (!original || original.reversedBy) {
        throw new Error(
          `Seed transfer "${transfer.id}" reverses "${transfer.reverses}", which can't be reversed`
        );
      }
      original.reversedBy = transfer.id;
    }

    if (transfer.from) {
      const from = transfer.from.toLowerCase();
      const balance = (balances[from] ?? 0) - transfer.amount;
      if (balance < 0) {
        throw new Error(
          `Seed transfer "${transfer.id}" overdraws @${transfer.from}`
        );
      }
      balances[from] = balance;
    }
    const to = transfer.to.toLowerCase();
    balances[to] = (balances[to] ?? 0) + transfer.amount;

    records.set(transfer.id, {
      id: transfer.id,
      kind: transfer.kind,
      amount: transfer.amount,
      from: transfer.from ? authorOf(transfer.from) : null,
      to: authorOf(transfer.to),
      note: transfer.note,
      context: transfer.context,
      createdAt: transfer.createdAt,
      holdUntil: transfer.holdUntil,
      reversedBy: null,
      reverses: transfer.reverses,
    });
  }

  return { transfers: [...records.values()], balances };
}
