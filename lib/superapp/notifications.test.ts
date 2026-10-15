import { describe, expect, it } from "vitest";

import { IPaymentRequest, ITransfer } from "../../types/Wallet";
import {
  requestNotifications,
  transferNotification,
  walletNotifications,
} from "./notifications";

const person = (username: string) => ({
  username,
  fullname: username,
  image: null,
});

const transfer = (fields: Partial<ITransfer>): ITransfer => ({
  id: "tx-1",
  kind: "tip",
  amount: 200,
  from: person("sarahcodes"),
  to: person("illlhanozkan"),
  note: null,
  context: { type: "tweet", id: "seed-t05" },
  createdAt: "2026-10-08T09:30:00.000Z",
  holdUntil: null,
  reversedBy: null,
  reverses: null,
  ...fields,
});

const request = (fields: Partial<IPaymentRequest>): IPaymentRequest => ({
  id: "req-1",
  requester: person("illlhanozkan"),
  payer: person("ayse_design"),
  amount: 1000,
  note: "Pizza",
  status: "pending",
  createdAt: "2026-10-07T10:00:00.000Z",
  expiresAt: "2026-10-14T10:00:00.000Z",
  respondedAt: null,
  transferId: null,
  conversationId: "dm-ayse_design-illlhanozkan",
  ...fields,
});

describe("transferNotification", () => {
  it("tells the recipient about a tip on their Tweet, with the amount", () => {
    const tweet = { id: "seed-t05", text: "Rebuilt the data layer" };
    expect(transferNotification(transfer({}), tweet)).toEqual({
      id: "tip-tx-1",
      type: "tip",
      createdAt: "2026-10-08T09:30:00.000Z",
      actor: person("sarahcodes"),
      tweet,
      amount: 200,
      transferId: "tx-1",
    });
    expect(transferNotification(transfer({}), null)).toMatchObject({
      type: "tip",
      tweet: null,
    });
  });

  it("tells the recipient about a payment, linking its conversation", () => {
    expect(
      transferNotification(
        transfer({
          kind: "payment",
          note: "Thanks",
          context: { type: "conversation", id: "dm-a-b" },
        }),
        null
      )
    ).toEqual({
      id: "pay-tx-1",
      type: "payment",
      createdAt: "2026-10-08T09:30:00.000Z",
      actor: person("sarahcodes"),
      amount: 200,
      note: "Thanks",
      transferId: "tx-1",
      conversationId: "dm-a-b",
    });
    expect(
      transferNotification(transfer({ kind: "payment", context: null }), null)
    ).toMatchObject({ conversationId: null });
  });

  it("says nothing about top-ups, request payments, orders, rides or refunds", () => {
    for (const fields of [
      { kind: "issue" as const, from: null },
      {
        kind: "request" as const,
        context: { type: "request" as const, id: "r" },
      },
      { kind: "order" as const },
      { kind: "ride_refund" as const },
      {
        kind: "tip" as const,
        context: { type: "ride" as const, id: "r", code: "C" },
      },
    ]) {
      expect(transferNotification(transfer(fields), null), fields.kind).toBe(
        null
      );
    }
  });
});

describe("requestNotifications", () => {
  it("tells the payer they were asked", () => {
    expect(requestNotifications(request({}), "AYSE_DESIGN")).toEqual([
      {
        id: "preq-req-1",
        type: "payment_request",
        createdAt: "2026-10-07T10:00:00.000Z",
        actor: person("illlhanozkan"),
        amount: 1000,
        note: "Pizza",
        requestId: "req-1",
        conversationId: "dm-ayse_design-illlhanozkan",
      },
    ]);
    expect(requestNotifications(request({}), "illlhanozkan")).toEqual([]);
  });

  it("tells the requester when it is paid or declined, at the answer's time", () => {
    const answered = "2026-10-07T11:00:00.000Z";
    expect(
      requestNotifications(
        request({ status: "paid", respondedAt: answered, transferId: "tx-4" }),
        "illlhanozkan"
      )
    ).toEqual([
      {
        id: "preq-paid-req-1",
        type: "request_paid",
        createdAt: answered,
        actor: person("ayse_design"),
        amount: 1000,
        requestId: "req-1",
        transferId: "tx-4",
      },
    ]);
    expect(
      requestNotifications(
        request({ status: "declined", respondedAt: answered }),
        "illlhanozkan"
      )
    ).toMatchObject([{ id: "preq-declined-req-1", type: "request_declined" }]);
    expect(
      requestNotifications(
        request({ status: "cancelled", respondedAt: answered }),
        "illlhanozkan"
      )
    ).toEqual([]);
  });
});

describe("walletNotifications", () => {
  it("keeps only what concerns the user", () => {
    const notifications = walletNotifications(
      "illlhanozkan",
      [
        { transfer: transfer({}), tweet: null },
        {
          transfer: transfer({ id: "tx-2", to: person("lenaframes") }),
          tweet: null,
        },
      ],
      [request({ status: "paid", respondedAt: "2026-10-07T11:00:00.000Z" })]
    );
    expect(notifications.map((n) => n.id)).toEqual([
      "tip-tx-1",
      "preq-paid-req-1",
    ]);
  });
});
