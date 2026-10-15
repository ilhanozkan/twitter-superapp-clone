import { describe, expect, it } from "vitest";

import {
  ForbiddenError,
  LimitExceededError,
  WalletFrozenError,
} from "../db/errors";
import {
  planSend,
  planTopUp,
  topUpWindowStart,
  toWallet,
  walletLimits,
} from "./wallet";

const person = (username: string) => ({
  username,
  fullname: username,
  image: null,
});
const key = { operationId: "tx-1", fingerprint: "f" };

describe("planSend", () => {
  const send = {
    ...key,
    kind: "payment" as const,
    from: person("devmarco"),
    to: person("illlhanozkan"),
    amount: 1500,
    note: "Thanks",
    context: { type: "conversation" as const, id: "dm-devmarco-illlhanozkan" },
  };

  it("plans one unheld transfer whose id is the operation id", () => {
    expect(planSend(send)).toEqual({
      id: "tx-1",
      kind: "payment",
      from: person("devmarco"),
      to: person("illlhanozkan"),
      amount: 1500,
      note: "Thanks",
      context: { type: "conversation", id: "dm-devmarco-illlhanozkan" },
      holdUntil: null,
      reverses: null,
    });
  });

  it("refuses paying or tipping yourself", () => {
    expect(() => planSend({ ...send, to: person("DevMarco") })).toThrow(
      "You can't send credits to yourself"
    );
    expect(() =>
      planSend({ ...send, kind: "tip", to: person("devmarco") })
    ).toThrow(ForbiddenError);
  });

  it("bounds payments to 0.50–200.00 and tips to 0.50–50.00", () => {
    expect(planSend({ ...send, amount: 50 }).amount).toBe(50);
    expect(planSend({ ...send, amount: 20_000 }).amount).toBe(20_000);
    expect(() => planSend({ ...send, amount: 49 })).toThrow(LimitExceededError);
    expect(() => planSend({ ...send, amount: 20_001 })).toThrow(
      "Payments are between 0.50 and 200.00 credits"
    );
    expect(() => planSend({ ...send, kind: "tip", amount: 5_001 })).toThrow(
      "Tips are between 0.50 and 50.00 credits"
    );
    expect(() => planSend({ ...send, amount: 1.5 })).toThrow(/whole/);
  });
});

describe("planTopUp", () => {
  const topUp = { ...key, to: person("sarahcodes"), amount: 5_000 };
  const ctx = { balance: 0, frozen: false, topUpsToday: 0 };

  it("issues the amount to the wallet", () => {
    expect(planTopUp(topUp, ctx)).toMatchObject({
      id: "tx-1",
      kind: "issue",
      from: null,
      to: person("sarahcodes"),
      amount: 5_000,
    });
  });

  it("only allows the listed amounts, 3 a day, up to a 1,000.00 balance", () => {
    expect(() => planTopUp({ ...topUp, amount: 1_234 }, ctx)).toThrow(
      "You can add 25.00, 50.00 or 100.00 credits"
    );
    expect(() => planTopUp(topUp, { ...ctx, topUpsToday: 3 })).toThrow(
      LimitExceededError
    );
    expect(planTopUp(topUp, { ...ctx, balance: 95_000 }).amount).toBe(5_000);
    expect(() => planTopUp(topUp, { ...ctx, balance: 95_001 })).toThrow(
      "Your balance can't go over 1,000.00 credits"
    );
  });

  it("refuses a frozen wallet first", () => {
    expect(() =>
      planTopUp({ ...topUp, amount: 1 }, { ...ctx, frozen: true })
    ).toThrow(WalletFrozenError);
  });
});

describe("wallet reads", () => {
  it("derives available from balance and pending", () => {
    expect(
      toWallet("sarahcodes", { balance: 1000, pending: 300, frozen: true })
    ).toEqual({
      username: "sarahcodes",
      balance: 1000,
      pending: 300,
      available: 700,
      frozen: true,
    });
  });

  it("reports what is left of the daily top-ups and pending requests", () => {
    expect(walletLimits({ topUpsToday: 1, pendingOutgoing: 4 })).toEqual({
      minPayment: 50,
      maxPayment: 20_000,
      minTip: 50,
      maxTip: 5_000,
      tipPresets: [100, 200, 500, 1_000],
      topUpAmounts: [2_500, 5_000, 10_000],
      topUpCap: 100_000,
      topUpsPerDay: 3,
      topUpsLeftToday: 2,
      pendingRequestsLeft: 6,
    });
    expect(walletLimits({ topUpsToday: 5, pendingOutgoing: 12 })).toMatchObject(
      { topUpsLeftToday: 0, pendingRequestsLeft: 0 }
    );
  });

  it("opens the top-up window 24 hours back", () => {
    expect(topUpWindowStart(new Date("2026-10-08T12:00:00.000Z"))).toBe(
      "2026-10-07T12:00:00.000Z"
    );
  });
});
