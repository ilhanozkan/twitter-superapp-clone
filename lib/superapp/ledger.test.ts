import { describe, expect, it } from "vitest";

import { ITransfer } from "../../types/Wallet";
import {
  InsufficientFundsError,
  InvalidStateError,
  WalletFrozenError,
} from "../db/errors";
import {
  auditLedger,
  isHeld,
  LedgerView,
  PendingTransfer,
  planLedger,
  toTransfer,
} from "./ledger";

const NOW = new Date("2026-10-08T12:00:00.000Z");
const minutes = (n: number) =>
  new Date(NOW.getTime() + n * 60_000).toISOString();

const person = (username: string) => ({
  username,
  fullname: username,
  image: null,
});

const pay = (
  id: string,
  from: string | null,
  to: string,
  amount: number,
  extra: Partial<PendingTransfer> = {}
): PendingTransfer => ({
  id,
  kind: from ? "payment" : "issue",
  from: from ? person(from) : null,
  to: person(to),
  amount,
  note: null,
  context: null,
  holdUntil: null,
  reverses: null,
  ...extra,
});

type Wallets = Record<
  string,
  { balance: number; pending?: number; frozen?: boolean }
>;

function viewOf(wallets: Wallets, transfers: ITransfer[] = []): LedgerView {
  return {
    now: NOW,
    wallet: (username) => {
      const wallet = wallets[username.toLowerCase()];
      return {
        exists: !!wallet,
        balance: wallet?.balance ?? 0,
        pending: wallet?.pending ?? 0,
        frozen: !!wallet?.frozen,
      };
    },
    transfer: (id) => transfers.find((transfer) => transfer.id === id) ?? null,
  };
}

/** A held order payment from alice to the shop, refundable for 10 minutes. */
const heldOrder = (extra: Partial<ITransfer> = {}): ITransfer => ({
  ...toTransfer(
    pay("order-1", "alice", "shop", 900, {
      kind: "order",
      holdUntil: minutes(10),
    }),
    minutes(-5)
  ),
  ...extra,
});
const refundOf = (original: ITransfer, extra: Partial<PendingTransfer> = {}) =>
  pay(
    `refund-${original.id}`,
    original.to.username,
    original.from!.username,
    original.amount,
    {
      kind: "order_refund",
      reverses: original.id,
      ...extra,
    }
  );

describe("planLedger", () => {
  it("moves credits and reports new balances by lower-case username", () => {
    const plan = planLedger(viewOf({ alice: { balance: 1000 } }), [
      pay("t1", "Alice", "Bob", 300),
    ]);
    expect(plan.balances).toEqual(
      new Map([
        ["alice", 700],
        ["bob", 300],
      ])
    );
    expect(plan.debited).toEqual(new Set(["alice"]));
    expect(plan.reversals).toEqual([]);
  });

  it("rejects malformed amounts and payments to yourself", () => {
    const view = viewOf({ alice: { balance: 1000 } });
    for (const amount of [0, -1, 1.5, Number.NaN, 2 ** 53]) {
      expect(() =>
        planLedger(view, [pay("t", "alice", "bob", amount)])
      ).toThrow(/invalid amount/);
    }
    expect(() => planLedger(view, [pay("t", "alice", "ALICE", 1)])).toThrow(
      /own sender/
    );
  });

  it("debits only available credits: pending ones are not spendable", () => {
    const view = viewOf({ alice: { balance: 1000, pending: 400 } });
    expect(
      planLedger(view, [pay("t", "alice", "bob", 600)]).balances.get("alice")
    ).toBe(400);

    let error: unknown;
    try {
      planLedger(view, [pay("t", "alice", "bob", 601)]);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(InsufficientFundsError);
    expect(error).toMatchObject({ available: 600, required: 601 });
  });

  it("refuses frozen senders and frozen recipients, issued credits included", () => {
    const view = viewOf({
      alice: { balance: 1000, frozen: true },
      bob: { balance: 1000 },
      carol: { balance: 0, frozen: true },
    });
    expect(() => planLedger(view, [pay("t", "alice", "bob", 100)])).toThrow(
      WalletFrozenError
    );
    expect(() => planLedger(view, [pay("t", "bob", "carol", 100)])).toThrow(
      WalletFrozenError
    );
    expect(() => planLedger(view, [pay("t", null, "carol", 100)])).toThrow(
      WalletFrozenError
    );
  });

  it("issues credits without a sender check", () => {
    const plan = planLedger(viewOf({}), [pay("grant", null, "dave", 100_000)]);
    expect(plan.balances).toEqual(new Map([["dave", 100_000]]));
    expect(plan.debited.size).toBe(0);
  });

  it("counts credits before later debits in the same operation", () => {
    const plan = planLedger(viewOf({}), [
      pay("fund", null, "demo_customer", 900),
      pay("order", "demo_customer", "shop", 900, { kind: "order" }),
    ]);
    expect(plan.balances).toEqual(
      new Map([
        ["demo_customer", 0],
        ["shop", 900],
      ])
    );
  });

  it("keeps a held credit pending, so the recipient can't spend it in the same operation", () => {
    const view = viewOf({ alice: { balance: 900 } });
    expect(() =>
      planLedger(view, [
        pay("order", "alice", "shop", 900, {
          kind: "order",
          holdUntil: minutes(10),
        }),
        pay("spend", "shop", "carol", 100),
      ])
    ).toThrow(InsufficientFundsError);
    // A hold that is already over is no hold.
    expect(
      planLedger(view, [
        pay("order", "alice", "shop", 900, {
          kind: "order",
          holdUntil: minutes(0),
        }),
        pay("spend", "shop", "carol", 100),
      ]).balances.get("shop")
    ).toBe(800);
  });

  describe("reversals", () => {
    const original = heldOrder();
    const view = (
      wallets: Wallets = { shop: { balance: 900, pending: 900 } }
    ) => viewOf(wallets, [original]);

    it("refund a held credit inside its window, from balance rather than available", () => {
      const plan = planLedger(view(), [refundOf(original)]);
      expect(plan.balances).toEqual(
        new Map([
          ["shop", 0],
          ["alice", 900],
        ])
      );
      expect(plan.debited.size).toBe(0);
      expect(plan.reversals).toEqual([
        { originalId: "order-1", refundId: "refund-order-1" },
      ]);
    });

    it("go through frozen wallets in both directions", () => {
      const plan = planLedger(
        view({
          shop: { balance: 900, pending: 900, frozen: true },
          alice: { balance: 0, frozen: true },
        }),
        [refundOf(original)]
      );
      expect(plan.balances.get("alice")).toBe(900);
    });

    it("are refused once the window is over, exactly at holdUntil included", () => {
      for (const holdUntil of [minutes(0), minutes(-1)]) {
        expect(() =>
          planLedger(
            viewOf({ shop: { balance: 900 } }, [heldOrder({ holdUntil })]),
            [refundOf(original)]
          )
        ).toThrow(InvalidStateError);
      }
      expect(() =>
        planLedger(
          viewOf({ shop: { balance: 900 } }, [heldOrder({ holdUntil: null })]),
          [refundOf(original)]
        )
      ).toThrow(InvalidStateError);
    });

    it("happen at most once", () => {
      expect(() =>
        planLedger(
          viewOf({ shop: { balance: 900 } }, [
            heldOrder({ reversedBy: "refund-x" }),
          ]),
          [refundOf(original)]
        )
      ).toThrow(/already refunded/);
      expect(() =>
        planLedger(view(), [
          refundOf(original),
          refundOf(original, { id: "refund-2" }),
        ])
      ).toThrow(InvalidStateError);
    });

    it("must mirror the original: amount, swapped parties, a known non-refund original", () => {
      expect(() =>
        planLedger(view(), [refundOf(original, { amount: 899 })])
      ).toThrow(/does not mirror/);
      expect(() =>
        planLedger(view(), [refundOf(original, { to: person("carol") })])
      ).toThrow(/does not mirror/);
      expect(() =>
        planLedger(view(), [refundOf(original, { reverses: "missing" })])
      ).toThrow(/unknown/);

      const refund = toTransfer(refundOf(original), minutes(-1));
      const ofRefund = pay("again", "alice", "shop", 900, {
        reverses: refund.id,
      });
      expect(() =>
        planLedger(
          viewOf({ alice: { balance: 900 } }, [
            { ...refund, holdUntil: minutes(5) },
          ]),
          [ofRefund]
        )
      ).toThrow(/does not mirror/);
    });

    it("never overdraw: a balance below the refund means a broken ledger", () => {
      expect(() =>
        planLedger(view({ shop: { balance: 100, pending: 900 } }), [
          refundOf(original),
        ])
      ).toThrow(InsufficientFundsError);
    });
  });
});

describe("isHeld", () => {
  it("is true for an unreversed credit until its holdUntil", () => {
    expect(isHeld({ holdUntil: minutes(1), reversedBy: null }, NOW)).toBe(true);
    expect(isHeld({ holdUntil: minutes(0), reversedBy: null }, NOW)).toBe(
      false
    );
    expect(isHeld({ holdUntil: minutes(1), reversedBy: "r" }, NOW)).toBe(false);
    expect(isHeld({ holdUntil: null, reversedBy: null }, NOW)).toBe(false);
  });
});

describe("auditLedger", () => {
  const grant = toTransfer(pay("grant", null, "alice", 1000), minutes(-60));
  const order = heldOrder();
  const refund: ITransfer = {
    ...toTransfer(refundOf(order), minutes(-1)),
  };
  const clean = {
    wallets: [
      { username: "alice", balance: 1000 },
      { username: "shop", balance: 0 },
    ],
    transfers: [grant, { ...order, reversedBy: refund.id }, refund],
    now: NOW,
  };

  it("passes a consistent ledger", () => {
    expect(auditLedger(clean)).toEqual({
      ok: true,
      wallets: 2,
      transfers: 3,
      issued: 1000,
      totalBalance: 1000,
      mismatches: [],
      negative: [],
      pendingOverBalance: [],
      badReversals: [],
    });
  });

  it("finds balances that don't match their transfers, and issued credits that don't add up", () => {
    const audit = auditLedger({
      ...clean,
      wallets: [
        { username: "Alice", balance: 1100 },
        { username: "shop", balance: 0 },
      ],
    });
    expect(audit.ok).toBe(false);
    expect(audit.mismatches).toEqual([
      { username: "alice", stored: 1100, computed: 1000 },
    ]);
    expect(audit.totalBalance).toBe(1100);
  });

  it("finds negative balances and pending credits over the balance", () => {
    const audit = auditLedger({
      wallets: [
        { username: "alice", balance: 100 },
        { username: "shop", balance: -100 },
      ],
      transfers: [
        toTransfer(pay("g", null, "alice", 1000), minutes(-60)),
        order,
      ],
      now: NOW,
    });
    expect(audit.negative).toEqual(["shop"]);
    expect(audit.pendingOverBalance).toEqual(["shop"]);
    expect(audit.ok).toBe(false);
  });

  it("finds reversals that don't mirror exactly one original", () => {
    const second = { ...refund, id: "refund-2" };
    const twice = auditLedger({
      ...clean,
      wallets: [
        { username: "alice", balance: 1900 },
        { username: "shop", balance: -900 },
      ],
      transfers: [...clean.transfers, second],
    });
    expect(twice.badReversals).toEqual(["refund-2", "refund-order-1"]);

    const wrongAmount = auditLedger({
      ...clean,
      transfers: [
        grant,
        { ...order, reversedBy: refund.id },
        { ...refund, amount: 800 },
      ],
    });
    expect(wrongAmount.badReversals).toContain("refund-order-1");

    const dangling = auditLedger({
      ...clean,
      transfers: [grant, { ...order, reversedBy: "nothing" }],
      wallets: [
        { username: "alice", balance: 100 },
        { username: "shop", balance: 900 },
      ],
    });
    expect(dangling.badReversals).toEqual(["order-1"]);
    expect(dangling.ok).toBe(false);
  });
});
