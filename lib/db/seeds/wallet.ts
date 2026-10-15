import {
  isHeld,
  LedgerView,
  PendingTransfer,
  planLedger,
  toTransfer,
} from "../../superapp/ledger";
import { isCents } from "../../superapp/money";
import {
  REQUEST_LIFETIME_MS,
  StoredPaymentRequest,
} from "../../superapp/requests";
import { Cents } from "../../../types/Money";
import { IAuthor } from "../../../types/User";
import { ITransfer } from "../../../types/Wallet";
import { InsufficientFundsError } from "../errors";
import { DEMO_USERNAME } from "./core";
import { LaneSeed, SeedContext, SeedTransfer } from "./types";

/** The wallet world: every lane's transfers, folded into balances, and F's requests. */
export interface WalletSeed {
  /** Oldest first; a held credit that was refunded names its refund in `reversedBy`. */
  transfers: ITransfer[];
  /** Balance per lower-case username after every transfer. */
  balances: Record<string, Cents>;
  requests: StoredPaymentRequest[];
}

/** A payment request in seed form: parties are usernames. */
export interface SeedPaymentRequest {
  id: string;
  requester: string;
  payer: string;
  amount: Cents;
  note: string | null;
  status: StoredPaymentRequest["status"];
  createdAt: string;
  respondedAt: string | null;
  transferId: string | null;
  conversationId: string | null;
}

export interface WalletSeedData {
  requests: SeedPaymentRequest[];
}

const HOUR = 60;
const DAY = 24 * HOUR;

/** Welcome grants: 300.00 for the demo user, 100.00 for every other person and driver. */
const GRANTS: [string, Cents][] = [
  [DEMO_USERNAME, 30_000],
  ...[
    "sarahcodes",
    "devmarco",
    "ayse_design",
    "nightowl_dev",
    "foodie_ankara",
    "lenaframes",
    "ahmet_drives",
    "elif_rides",
    "canwheels",
    "zeynep_xl",
  ].map((username): [string, Cents] => [username, 10_000]),
];

/**
 * F's part of the world: the wallets announcement, welcome grants, a few
 * tips and payments, and payment requests. On its own it leaves the demo
 * user at 325.00 credits.
 */
export function createWalletSeed({
  at,
}: SeedContext): LaneSeed<WalletSeedData> {
  const transfer = (
    id: string,
    minutesAgo: number,
    fields: Pick<SeedTransfer, "kind" | "from" | "to" | "amount"> &
      Partial<Pick<SeedTransfer, "note" | "context">>
  ): SeedTransfer => ({
    id,
    note: null,
    context: null,
    holdUntil: null,
    reverses: null,
    createdAt: at(minutesAgo),
    ...fields,
  });
  const tip = (
    id: string,
    minutesAgo: number,
    from: string,
    to: string,
    amount: Cents,
    tweetId: string
  ) =>
    transfer(id, minutesAgo, {
      kind: "tip",
      from,
      to,
      amount,
      context: { type: "tweet", id: tweetId },
    });

  return {
    data: {
      requests: [
        {
          id: "seed-req01",
          requester: "sarahcodes",
          payer: DEMO_USERNAME,
          amount: 450,
          note: "Coffee ☕",
          status: "pending",
          createdAt: at(5 * HOUR),
          respondedAt: null,
          transferId: null,
          conversationId: "dm-illlhanozkan-sarahcodes",
        },
        {
          id: "seed-req02",
          requester: DEMO_USERNAME,
          payer: "ayse_design",
          amount: 1_000,
          note: "Design sprint pizza 🍕",
          status: "paid",
          createdAt: at(26 * HOUR),
          respondedAt: at(25 * HOUR),
          transferId: "seed-tx04",
          conversationId: "dm-ayse_design-illlhanozkan",
        },
        {
          id: "seed-req03",
          requester: "devmarco",
          payer: DEMO_USERNAME,
          amount: 300,
          note: "Parking 🅿️",
          status: "pending",
          createdAt: at(DAY),
          respondedAt: null,
          transferId: null,
          conversationId: null,
        },
        {
          id: "seed-req04",
          requester: "nightowl_dev",
          payer: DEMO_USERNAME,
          amount: 600,
          note: "Team lunch 🍜",
          status: "pending",
          createdAt: at(2 * DAY),
          respondedAt: null,
          transferId: null,
          conversationId: null,
        },
      ],
    },
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
      transfers: [
        ...GRANTS.map(([username, amount]) =>
          transfer(`seed-grant-${username}`, 7 * DAY, {
            kind: "issue",
            from: null,
            to: username,
            amount,
          })
        ),
        tip("seed-tx01", 75, DEMO_USERNAME, "lenaframes", 200, "seed-t03"),
        tip("seed-tx02", 150, "sarahcodes", DEMO_USERNAME, 200, "seed-t05"),
        transfer("seed-tx03", 3 * HOUR, {
          kind: "payment",
          from: "devmarco",
          to: DEMO_USERNAME,
          amount: 1_500,
          note: "Thanks for the code review 🙏",
          context: { type: "conversation", id: "dm-devmarco-illlhanozkan" },
        }),
        // Ayşe pays seed-req02: a request payment carries the request's note.
        transfer("seed-tx04", 25 * HOUR, {
          kind: "request",
          from: "ayse_design",
          to: DEMO_USERNAME,
          amount: 1_000,
          note: "Design sprint pizza 🍕",
          context: { type: "request", id: "seed-req02" },
        }),
        tip("seed-tx05", 60, "ayse_design", "lenaframes", 100, "seed-t03"),
        tip("seed-tx06", 30, "foodie_ankara", "sarahcodes", 500, "seed-t02"),
      ],
    },
  };
}

const byTime = (a: SeedTransfer, b: SeedTransfer) =>
  Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Folds the transfers every lane contributed, in time order, through the
 * same planner the stores use (so holds, refund windows and available
 * credits apply), then resolves F's requests. A seed that would overdraw a
 * wallet, reverse a transfer it can't, or name a missing payment is a bug
 * in that lane's seed, so it throws.
 */
export function composeWalletSeed(
  transfers: SeedTransfer[],
  authorOf: (username: string) => IAuthor,
  requests: SeedPaymentRequest[] = []
): WalletSeed {
  const balances = new Map<string, Cents>();
  const records = new Map<string, ITransfer>();

  for (const seed of [...transfers].sort(byTime)) {
    if (!isCents(seed.amount) || seed.amount === 0) {
      throw new Error(`Seed transfer "${seed.id}" has an invalid amount`);
    }
    if (records.has(seed.id)) {
      throw new Error(`Seed transfer "${seed.id}" is not unique`);
    }

    const transfer: PendingTransfer = {
      id: seed.id,
      kind: seed.kind,
      from: seed.from ? authorOf(seed.from) : null,
      to: authorOf(seed.to),
      amount: seed.amount,
      note: seed.note,
      context: seed.context,
      holdUntil: seed.holdUntil,
      reverses: seed.reverses,
    };
    const now = new Date(seed.createdAt);
    const view: LedgerView = {
      now,
      wallet: (username) => {
        const key = username.toLowerCase();
        let pending = 0;
        records.forEach((record) => {
          if (record.to.username.toLowerCase() === key && isHeld(record, now))
            pending += record.amount;
        });
        return {
          exists: balances.has(key),
          balance: balances.get(key) ?? 0,
          pending,
          frozen: false,
        };
      },
      transfer: (id) => records.get(id) ?? null,
    };

    let plan;
    try {
      plan = planLedger(view, [transfer]);
    } catch (error) {
      if (seed.reverses) {
        throw new Error(
          `Seed transfer "${seed.id}" reverses "${seed.reverses}", which can't be reversed`,
          { cause: error }
        );
      }
      if (error instanceof InsufficientFundsError) {
        throw new Error(`Seed transfer "${seed.id}" overdraws @${seed.from}`, {
          cause: error,
        });
      }
      throw error;
    }

    plan.balances.forEach((balance, key) => balances.set(key, balance));
    for (const { originalId, refundId } of plan.reversals) {
      records.get(originalId)!.reversedBy = refundId;
    }
    records.set(seed.id, toTransfer(transfer, seed.createdAt));
  }

  return {
    transfers: [...records.values()],
    balances: Object.fromEntries(balances),
    requests: requests.map((request) => {
      if (request.transferId && !records.has(request.transferId)) {
        throw new Error(
          `Seed request "${request.id}" names missing transfer "${request.transferId}"`
        );
      }
      return {
        ...request,
        requester: authorOf(request.requester),
        payer: authorOf(request.payer),
        expiresAt: new Date(
          Date.parse(request.createdAt) + REQUEST_LIFETIME_MS
        ).toISOString(),
        requestHash: null,
      };
    }),
  };
}
