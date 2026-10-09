import { describe, expect, it } from "vitest";

import { IPaymentRequest } from "../../types/Wallet";
import {
  ForbiddenError,
  InvalidStateError,
  LimitExceededError,
  NotFoundError,
  WalletFrozenError,
} from "../db/errors";
import {
  closedStatus,
  closeRequestTransition,
  isOpenRequest,
  planPaymentRequest,
  planRequestPayment,
  requestStatus,
  toPaymentRequestDto,
} from "./requests";

const NOW = new Date("2026-10-08T12:00:00.000Z");
const person = (username: string) => ({
  username,
  fullname: username,
  image: null,
});

const input = {
  operationId: "req-1",
  fingerprint: "hash-1",
  requester: person("sarahcodes"),
  payer: person("illlhanozkan"),
  amount: 450,
  note: "Coffee ☕",
  conversationId: "dm-illlhanozkan-sarahcodes",
};
const ctx = {
  now: NOW,
  pendingOutgoing: 0,
  requesterFrozen: false,
  payerFrozen: false,
};

describe("planPaymentRequest", () => {
  it("plans a pending request that expires in 7 days and remembers its fingerprint", () => {
    expect(planPaymentRequest(input, ctx)).toEqual({
      id: "req-1",
      requester: person("sarahcodes"),
      payer: person("illlhanozkan"),
      amount: 450,
      note: "Coffee ☕",
      status: "pending",
      createdAt: "2026-10-08T12:00:00.000Z",
      expiresAt: "2026-10-15T12:00:00.000Z",
      respondedAt: null,
      transferId: null,
      conversationId: "dm-illlhanozkan-sarahcodes",
      requestHash: "hash-1",
    });
  });

  it("refuses asking yourself, amounts out of bounds and a full pending list", () => {
    expect(() =>
      planPaymentRequest({ ...input, payer: person("SarahCodes") }, ctx)
    ).toThrow(ForbiddenError);
    for (const amount of [49, 20_001]) {
      expect(() => planPaymentRequest({ ...input, amount }, ctx)).toThrow(
        LimitExceededError
      );
    }
    expect(() => planPaymentRequest({ ...input, amount: 4.5 }, ctx)).toThrow(
      /whole hundredths/
    );
    expect(planPaymentRequest(input, { ...ctx, pendingOutgoing: 9 }).id).toBe(
      "req-1"
    );
    expect(() =>
      planPaymentRequest(input, { ...ctx, pendingOutgoing: 10 })
    ).toThrow(/10 pending requests/);
  });

  it("refuses frozen wallets on either side", () => {
    expect(() =>
      planPaymentRequest(input, { ...ctx, requesterFrozen: true })
    ).toThrow(WalletFrozenError);
    expect(() =>
      planPaymentRequest(input, { ...ctx, payerFrozen: true })
    ).toThrow(WalletFrozenError);
  });
});

describe("request status", () => {
  const record = planPaymentRequest(input, ctx);
  const at = (days: number) =>
    new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);

  it("derives expired from the clock, for pending requests only", () => {
    expect(requestStatus(record, at(6.9))).toBe("pending");
    expect(requestStatus(record, at(7))).toBe("expired");
    expect(requestStatus({ ...record, status: "paid" }, at(8))).toBe("paid");
    expect(isOpenRequest(record, at(1))).toBe(true);
    expect(isOpenRequest(record, at(7))).toBe(false);
  });

  it("reads as the API shape, without the fingerprint", () => {
    const dto = toPaymentRequestDto(record, at(8));
    expect(dto.status).toBe("expired");
    expect(dto).not.toHaveProperty("requestHash");
  });
});

describe("planRequestPayment", () => {
  const request = toPaymentRequestDto(planPaymentRequest(input, ctx), NOW);

  it("pays the requester the requested amount, with the request as context", () => {
    expect(planRequestPayment(request, "ILLLHANOZKAN", "tx-9")).toEqual({
      id: "tx-9",
      kind: "request",
      from: person("illlhanozkan"),
      to: person("sarahcodes"),
      amount: 450,
      note: "Coffee ☕",
      context: { type: "request", id: "req-1" },
      holdUntil: null,
      reverses: null,
    });
  });

  it("hides the request from anyone but the payer and refuses closed ones", () => {
    expect(() => planRequestPayment(request, "sarahcodes", "tx")).toThrow(
      NotFoundError
    );
    expect(() => planRequestPayment(request, "devmarco", "tx")).toThrow(
      NotFoundError
    );
    for (const [status, message] of [
      ["paid", /already paid/],
      ["declined", /declined/],
      ["cancelled", /cancelled/],
      ["expired", /expired/],
    ] as const) {
      expect(() =>
        planRequestPayment({ ...request, status }, "illlhanozkan", "tx")
      ).toThrow(message);
    }
  });
});

describe("closeRequestTransition", () => {
  const pending: IPaymentRequest = toPaymentRequestDto(
    planPaymentRequest(input, ctx),
    NOW
  );

  it("lets the payer decline and the requester cancel a pending request", () => {
    expect(closeRequestTransition(pending, "illlhanozkan", "decline")).toBe(
      true
    );
    expect(closeRequestTransition(pending, "SarahCodes", "cancel")).toBe(true);
    expect(closedStatus("decline")).toBe("declined");
    expect(closedStatus("cancel")).toBe("cancelled");
  });

  it("treats the same action again as a no-op", () => {
    expect(
      closeRequestTransition(
        { ...pending, status: "declined" },
        "illlhanozkan",
        "decline"
      )
    ).toBe(false);
    expect(
      closeRequestTransition(
        { ...pending, status: "cancelled" },
        "sarahcodes",
        "cancel"
      )
    ).toBe(false);
  });

  it("refuses strangers, the wrong party and incompatible states", () => {
    expect(() =>
      closeRequestTransition(pending, "devmarco", "decline")
    ).toThrow(NotFoundError);
    expect(() =>
      closeRequestTransition(pending, "sarahcodes", "decline")
    ).toThrow(ForbiddenError);
    expect(() =>
      closeRequestTransition(pending, "illlhanozkan", "cancel")
    ).toThrow(ForbiddenError);
    for (const status of ["paid", "expired", "cancelled"] as const) {
      expect(() =>
        closeRequestTransition(
          { ...pending, status },
          "illlhanozkan",
          "decline"
        )
      ).toThrow(InvalidStateError);
    }
  });
});
