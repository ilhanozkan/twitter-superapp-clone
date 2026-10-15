import { describe, expect, it } from "vitest";

import { ITransfer } from "../../types/Wallet";
import {
  describeTransfer,
  isPending,
  transferDirection,
  transferReference,
} from "./transferText";

const me = { username: "illlhanozkan", fullname: "Ilhan Ozkan", image: null };
const lena = { username: "lenaframes", fullname: "Lena Hoffmann", image: null };
const cafe = {
  username: "kizilaykahve",
  fullname: "Kızılay Kahve",
  image: null,
};

const transfer = (overrides: Partial<ITransfer>): ITransfer => ({
  id: "tx-1",
  kind: "payment",
  amount: 200,
  from: me,
  to: lena,
  note: null,
  context: null,
  createdAt: "2026-10-09T12:00:00.000Z",
  holdUntil: null,
  reversedBy: null,
  reverses: null,
  ...overrides,
});

describe("transfer text", () => {
  it("signs from the viewer's side", () => {
    expect(transferDirection(transfer({}), "illlhanozkan")).toBe("sent");
    expect(transferDirection(transfer({}), "LenaFrames")).toBe("received");
  });

  it.each([
    [
      { kind: "issue", from: null, to: me },
      "illlhanozkan",
      "Added demo credits",
    ],
    [
      { kind: "tip", context: { type: "tweet", id: "seed-t03" } },
      "illlhanozkan",
      "Tip on @lenaframes's Tweet",
    ],
    [
      { kind: "tip", context: { type: "tweet", id: "seed-t03" } },
      "lenaframes",
      "Ilhan Ozkan tipped your Tweet",
    ],
    [{ kind: "payment" }, "illlhanozkan", "Payment to Lena Hoffmann"],
    [{ kind: "payment" }, "lenaframes", "Payment from Ilhan Ozkan"],
    [{ kind: "request" }, "lenaframes", "Ilhan Ozkan paid your request"],
    [
      {
        kind: "order",
        to: cafe,
        context: { type: "order", id: "o1", code: "K7Q2" },
      },
      "illlhanozkan",
      "Order #K7Q2 · Kızılay Kahve",
    ],
    [
      {
        kind: "order_refund",
        from: cafe,
        to: me,
        context: { type: "order", id: "o1", code: "K7Q2" },
      },
      "illlhanozkan",
      "Refund · Order #K7Q2",
    ],
  ] as [Partial<ITransfer>, string, string][])(
    "%j for %s: %s",
    (overrides, viewer, text) => {
      expect(describeTransfer(transfer(overrides), viewer)).toBe(text);
    }
  );

  it("makes a reference people can quote", () => {
    expect(transferReference("seed-tx01")).toBe("TX-SEEDTX01");
    expect(transferReference("tx-4k2p9a")).toBe("TX-4K2P9A");
  });

  it("is pending while held, not refunded and not yet released", () => {
    const now = Date.parse("2026-10-09T12:00:00.000Z");
    const held = transfer({ holdUntil: "2026-10-09T12:05:00.000Z" });
    expect(isPending(held, now)).toBe(true);
    expect(isPending({ ...held, reversedBy: "tx-2" }, now)).toBe(false);
    expect(
      isPending({ ...held, holdUntil: "2026-10-09T11:00:00.000Z" }, now)
    ).toBe(false);
    expect(isPending(transfer({}), now)).toBe(false);
  });
});
