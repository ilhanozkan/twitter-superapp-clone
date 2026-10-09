import { beforeEach, describe, expect, it } from "vitest";

import {
  commitTransfers,
  expectLedgerInvariants,
  expectStoresAgree,
  heldPayment,
  mulberry32,
  reverseTransfer,
  Subject,
  SUBJECT_NOW,
  subjects,
} from "../../test/repositorySubjects";
import { IAuthor } from "../../types/User";
import {
  fingerprint,
  operationId,
  OperationScope,
} from "../superapp/idempotency";
import {
  ConflictError,
  ForbiddenError,
  IdempotencyKeyReusedError,
  InsufficientFundsError,
  InvalidStateError,
  LimitExceededError,
  NotFoundError,
  WalletFrozenError,
} from "./errors";
import { createMemoryRepository, createMemoryState } from "./memory";
import { exposedPrivateDocuments } from "./sanity/privacy";
import { createSeedData, DEMO_USERNAME } from "./seed";
import { Repository } from "./types";
import { SendInput } from "./wallet/types";

// The wallet on both stores: sends, tips, top-ups and payment requests,
// replays, limits, freezes, holds and refunds, concurrency, and the ledger
// invariants after every scenario. Fresh accounts (alice_test, ...) keep
// the assertions independent of what later lanes add to the seed world.

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const author = (username: string, fullname = username): IAuthor => ({
  username,
  fullname,
  image: null,
});
const me: IAuthor = {
  username: DEMO_USERNAME,
  fullname: "Ilhan Ozkan",
  image: "/avatars/illlhanozkan.svg",
};
const sarah: IAuthor = {
  username: "sarahcodes",
  fullname: "Sarah Chen",
  image: "/avatars/sarahcodes.svg",
};
const marco: IAuthor = {
  username: "devmarco",
  fullname: "Marco Rossi",
  image: "/avatars/devmarco.svg",
};
const alice = author("alice_test", "Alice Test");
const bob = author("bob_test", "Bob Test");
const carol = author("carol_test", "Carol Test");
const shop = author("shop_test", "Test Shop");

let keys = 0;
const nextKey = () => `test-key-${++keys}`;

/** The ids a route would derive from the actor, scope, key and body. */
const keyed = (
  actor: IAuthor,
  scope: OperationScope,
  prefix: "tx" | "req",
  body: unknown,
  key = nextKey()
) => ({
  operationId: operationId(prefix, actor.username, scope, key),
  fingerprint: fingerprint(body),
});

const sendInput = (
  from: IAuthor,
  to: IAuthor,
  amount: number,
  {
    key,
    kind = "payment",
    note = null,
    context = null,
  }: {
    key?: string;
    kind?: "payment" | "tip";
    note?: string | null;
    context?: SendInput["context"];
  } = {}
): SendInput => ({
  ...keyed(
    from,
    kind === "tip" ? "tweets.tip" : "wallet.send",
    "tx",
    { to: to.username, amount, note, context },
    key
  ),
  kind,
  from,
  to,
  amount,
  note,
  context,
});

const tipInput = (from: IAuthor, to: IAuthor, tweetId: string, amount = 200) =>
  sendInput(from, to, amount, {
    kind: "tip",
    context: { type: "tweet", id: tweetId },
  });

const topUpInput = (to: IAuthor, amount: number, key?: string) => ({
  ...keyed(to, "wallet.topUp", "tx", { amount }, key),
  to,
  amount,
});

const requestInput = (
  requester: IAuthor,
  payer: IAuthor,
  amount: number,
  { key, note = null }: { key?: string; note?: string | null } = {}
) => ({
  ...keyed(
    requester,
    "wallet.request",
    "req",
    { from: payer.username, amount, note },
    key
  ),
  requester,
  payer,
  amount,
  note,
  conversationId: null,
});

const payInput = (payer: IAuthor, id: string, key?: string) => ({
  ...keyed(payer, "wallet.payRequest", "tx", { id }, key),
  id,
  payer,
});

const minutesFrom = (subject: Subject, minutes: number) =>
  new Date(subject.clock.now().getTime() + minutes * MINUTE).toISOString();

describe.each(subjects())("%s wallet", (name, create) => {
  let subject: Subject;
  let repo: Repository;
  const balance = async (user: IAuthor) =>
    (await repo.wallet.getWallet(user.username)).balance;
  /** alice_test with exactly `cents` (via top-ups and a payment to carol_test). */
  const fundAlice = async (cents: number) => {
    await repo.wallet.topUp(topUpInput(alice, 2_500));
    if (cents < 2_500)
      await repo.wallet.send(sendInput(alice, carol, 2_500 - cents));
  };

  beforeEach(() => {
    subject = create();
    repo = subject.repo;
  });

  describe("reads", () => {
    it("serves F's seeded transfers, requests and tips", async () => {
      expect(await repo.wallet.getTransfer("seed-tx03")).toEqual({
        id: "seed-tx03",
        kind: "payment",
        amount: 1_500,
        from: marco,
        to: me,
        note: "Thanks for the code review 🙏",
        context: { type: "conversation", id: "dm-devmarco-illlhanozkan" },
        createdAt: "2026-10-08T09:00:00.000Z",
        holdUntil: null,
        reversedBy: null,
        reverses: null,
      });
      expect(await repo.wallet.getRequest("seed-req02")).toEqual({
        id: "seed-req02",
        requester: me,
        payer: {
          username: "ayse_design",
          fullname: "Ayşe Yılmaz",
          image: "/avatars/ayse_design.svg",
        },
        amount: 1_000,
        note: "Design sprint pizza 🍕",
        status: "paid",
        createdAt: "2026-10-07T10:00:00.000Z",
        expiresAt: "2026-10-14T10:00:00.000Z",
        respondedAt: "2026-10-07T11:00:00.000Z",
        transferId: "seed-tx04",
        conversationId: "dm-ayse_design-illlhanozkan",
      });
      expect(await repo.wallet.getRequest("seed-req01")).toMatchObject({
        status: "pending",
        requester: sarah,
        payer: me,
      });

      expect(
        await repo.wallet.tipStats(
          ["seed-t03", "seed-t05", "seed-t02", "seed-t01"],
          DEMO_USERNAME
        )
      ).toEqual(
        new Map([
          ["seed-t03", { tips: 2, tipped: true }],
          ["seed-t05", { tips: 1, tipped: false }],
          ["seed-t02", { tips: 1, tipped: false }],
          ["seed-t01", { tips: 0, tipped: false }],
        ])
      );
      expect(await repo.wallet.tipStats([], DEMO_USERNAME)).toEqual(new Map());
    });

    it("reads a wallet that doesn't exist as empty", async () => {
      expect(await repo.wallet.getWallet("alice_test")).toEqual({
        username: "alice_test",
        balance: 0,
        pending: 0,
        available: 0,
        frozen: false,
      });
      expect(await repo.wallet.getTransfer("missing")).toBeNull();
      expect(await repo.wallet.getTransfer("private.seed-tx01")).toBeNull();
      expect(await repo.wallet.getRequest("nope")).toBeNull();
      expect(await repo.wallet.listActivity("alice_test")).toEqual({
        items: [],
        nextCursor: null,
      });
      expect(await repo.wallet.getLimits("alice_test")).toMatchObject({
        topUpsLeftToday: 3,
        pendingRequestsLeft: 10,
      });
    });

    it("passes the ledger invariants on the seeded world", async () => {
      await expectLedgerInvariants(subject);
    });
  });

  describe("send", () => {
    it("moves credits and reports the sender's wallet", async () => {
      const [sarahBefore, marcoBefore] = [
        await balance(sarah),
        await balance(marco),
      ];
      const result = await repo.wallet.send(
        sendInput(sarah, marco, 1_250, { note: "Lunch 🍜" })
      );

      expect(result.replayed).toBe(false);
      expect(result.transfer).toMatchObject({
        kind: "payment",
        amount: 1_250,
        from: sarah,
        to: marco,
        note: "Lunch 🍜",
        context: null,
        createdAt: SUBJECT_NOW.toISOString(),
        holdUntil: null,
        reversedBy: null,
        reverses: null,
      });
      expect(result.transfer.id).toMatch(/^tx-[0-9a-f]{32}$/);
      expect(result.wallet).toEqual(await repo.wallet.getWallet("sarahcodes"));
      expect(await balance(sarah)).toBe(sarahBefore - 1_250);
      expect(await balance(marco)).toBe(marcoBefore + 1_250);
      expect(await repo.wallet.getTransfer(result.transfer.id)).toEqual(
        result.transfer
      );
      await expectLedgerInvariants(subject);
    });

    it("refuses an overdraft with the available amount, writing nothing", async () => {
      await fundAlice(1_000);
      let error: unknown;
      try {
        await repo.wallet.send(sendInput(alice, bob, 1_001));
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(InsufficientFundsError);
      expect(error).toMatchObject({ available: 1_000, required: 1_001 });
      expect(await balance(alice)).toBe(1_000);
      expect(await balance(bob)).toBe(0);
      await expectLedgerInvariants(subject);
    });

    it("refuses paying yourself and amounts out of bounds", async () => {
      await fundAlice(2_500);
      await expect(
        repo.wallet.send(
          sendInput(alice, { ...alice, username: "Alice_Test" }, 100)
        )
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        repo.wallet.send(sendInput(alice, bob, 49))
      ).rejects.toBeInstanceOf(LimitExceededError);
      await expect(
        repo.wallet.send(sendInput(alice, bob, 5_001, { kind: "tip" }))
      ).rejects.toBeInstanceOf(LimitExceededError);
    });

    it("replays the same key once and refuses it with a different body", async () => {
      await fundAlice(2_500);
      const input = sendInput(alice, bob, 500, { key: "same-key-1" });
      const first = await repo.wallet.send(input);
      const again = await repo.wallet.send(input);

      expect(again.replayed).toBe(true);
      expect(again.transfer).toEqual(first.transfer);
      expect(await balance(alice)).toBe(2_000);
      const { items } = await repo.wallet.listActivity("alice_test");
      expect(items.filter((t) => t.id === first.transfer.id)).toHaveLength(1);

      await expect(
        repo.wallet.send(sendInput(alice, bob, 600, { key: "same-key-1" }))
      ).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
      await expect(
        repo.wallet.send(sendInput(alice, carol, 500, { key: "same-key-1" }))
      ).rejects.toBeInstanceOf(IdempotencyKeyReusedError);

      // The key is scoped to its actor: Bob may use it too.
      const bobs = await repo.wallet.send(
        sendInput(bob, alice, 100, { key: "same-key-1" })
      );
      expect(bobs.replayed).toBe(false);
      expect(bobs.transfer.id).not.toBe(first.transfer.id);
      await expectLedgerInvariants(subject);
    });
  });

  describe("top-ups", () => {
    it("issues demo credits, at most 3 per rolling 24 hours", async () => {
      for (const amount of [2_500, 5_000, 10_000]) {
        const { transfer, wallet } = await repo.wallet.topUp(
          topUpInput(alice, amount)
        );
        expect(transfer).toMatchObject({
          kind: "issue",
          from: null,
          to: alice,
          amount,
        });
        expect(wallet.username).toBe("alice_test");
      }
      expect(await balance(alice)).toBe(17_500);
      expect((await repo.wallet.getLimits("alice_test")).topUpsLeftToday).toBe(
        0
      );
      await expect(repo.wallet.topUp(topUpInput(alice, 2_500))).rejects.toThrow(
        /3 times a day/
      );

      subject.clock.advance(DAY - 1);
      await expect(
        repo.wallet.topUp(topUpInput(alice, 2_500))
      ).rejects.toBeInstanceOf(LimitExceededError);
      subject.clock.advance(1);
      expect((await repo.wallet.getLimits("alice_test")).topUpsLeftToday).toBe(
        3
      );
      await repo.wallet.topUp(topUpInput(alice, 2_500));
      await expectLedgerInvariants(subject);
    });

    it("only allows the listed amounts and never past 1,000.00", async () => {
      await expect(
        repo.wallet.topUp(topUpInput(alice, 1_234))
      ).rejects.toBeInstanceOf(LimitExceededError);

      // 900.00 over three days, then 100.00 would pass the cap.
      for (let day = 0; day < 3; day++) {
        for (let i = 0; i < 3; i++)
          await repo.wallet.topUp(topUpInput(alice, 10_000));
        subject.clock.advance(DAY);
      }
      expect(await balance(alice)).toBe(90_000);
      await expect(
        repo.wallet.topUp(topUpInput(alice, 10_000))
      ).resolves.toBeDefined();
      await expect(repo.wallet.topUp(topUpInput(alice, 2_500))).rejects.toThrow(
        "Your balance can't go over 1,000.00 credits"
      );
      expect(await balance(alice)).toBe(100_000);
    });

    it("replays without counting twice", async () => {
      const input = topUpInput(alice, 2_500, "topup-key-1");
      await repo.wallet.topUp(input);
      expect((await repo.wallet.topUp(input)).replayed).toBe(true);
      expect(await balance(alice)).toBe(2_500);
      expect((await repo.wallet.getLimits("alice_test")).topUpsLeftToday).toBe(
        2
      );
    });
  });

  describe("payment requests", () => {
    it("runs the lifecycle: request, pay once, replay", async () => {
      await fundAlice(2_000);
      const { request, replayed } = await repo.wallet.createRequest(
        requestInput(bob, alice, 450, { note: "Coffee ☕" })
      );
      expect(replayed).toBe(false);
      expect(request).toEqual({
        id: expect.stringMatching(/^req-[0-9a-f]{32}$/),
        requester: bob,
        payer: alice,
        amount: 450,
        note: "Coffee ☕",
        status: "pending",
        createdAt: SUBJECT_NOW.toISOString(),
        expiresAt: new Date(SUBJECT_NOW.getTime() + 7 * DAY).toISOString(),
        respondedAt: null,
        transferId: null,
        conversationId: null,
      });
      expect(await repo.wallet.getRequest(request.id)).toEqual(request);
      expect(
        await repo.wallet.listRequests("bob_test", { role: "outgoing" })
      ).toEqual([request]);
      expect(
        await repo.wallet.listRequests("ALICE_TEST", { role: "incoming" })
      ).toEqual([request]);
      expect(
        (await repo.wallet.getLimits("bob_test")).pendingRequestsLeft
      ).toBe(9);

      subject.clock.advance(MINUTE);
      const pay = payInput(alice, request.id);
      const paid = await repo.wallet.payRequest(pay);
      expect(paid.replayed).toBe(false);
      expect(paid.transfer).toMatchObject({
        id: pay.operationId,
        kind: "request",
        from: alice,
        to: bob,
        amount: 450,
        note: "Coffee ☕",
        context: { type: "request", id: request.id },
      });
      expect(paid.request).toEqual({
        ...request,
        status: "paid",
        respondedAt: paid.transfer.createdAt,
        transferId: paid.transfer.id,
      });
      expect(await repo.wallet.getRequest(request.id)).toEqual(paid.request);
      expect(paid.wallet).toEqual(await repo.wallet.getWallet("alice_test"));
      expect(await balance(alice)).toBe(1_550);
      expect(await balance(bob)).toBe(450);

      const again = await repo.wallet.payRequest(pay);
      expect(again.replayed).toBe(true);
      expect(again.transfer).toEqual(paid.transfer);
      expect(again.request).toEqual(paid.request);
      await expect(
        repo.wallet.payRequest(payInput(alice, request.id))
      ).rejects.toThrow("This request was already paid");
      expect(await balance(alice)).toBe(1_550);
      await expectLedgerInvariants(subject);
    });

    it("hides a request from everyone but its payer when paying", async () => {
      await fundAlice(2_000);
      const { request } = await repo.wallet.createRequest(
        requestInput(bob, alice, 450)
      );
      await expect(
        repo.wallet.payRequest(payInput(carol, request.id))
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        repo.wallet.payRequest(payInput(bob, request.id))
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        repo.wallet.payRequest(payInput(alice, "missing-request"))
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("declines and cancels idempotently by target state", async () => {
      const { request } = await repo.wallet.createRequest(
        requestInput(bob, alice, 450)
      );
      const declined = await repo.wallet.closeRequest(
        request.id,
        "Alice_Test",
        "decline"
      );
      expect(declined).toEqual({
        changed: true,
        request: {
          ...request,
          status: "declined",
          respondedAt: SUBJECT_NOW.toISOString(),
        },
      });
      expect(
        await repo.wallet.closeRequest(request.id, "alice_test", "decline")
      ).toEqual({
        changed: false,
        request: declined.request,
      });
      await expect(
        repo.wallet.closeRequest(request.id, "bob_test", "cancel")
      ).rejects.toThrow("This request was declined");
      await expect(
        repo.wallet.payRequest(payInput(alice, request.id))
      ).rejects.toBeInstanceOf(InvalidStateError);

      const second = (
        await repo.wallet.createRequest(requestInput(bob, alice, 300))
      ).request;
      await expect(
        repo.wallet.closeRequest(second.id, "alice_test", "cancel")
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        repo.wallet.closeRequest(second.id, "carol_test", "decline")
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        repo.wallet.closeRequest("missing", "bob_test", "cancel")
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(
        (await repo.wallet.closeRequest(second.id, "bob_test", "cancel"))
          .changed
      ).toBe(true);
      expect(
        (await repo.wallet.closeRequest(second.id, "bob_test", "cancel"))
          .changed
      ).toBe(false);
      expect(
        await repo.wallet.listRequests("bob_test", {
          role: "outgoing",
          status: "cancelled",
        })
      ).toHaveLength(1);
    });

    it("expires requests with the clock", async () => {
      await fundAlice(2_000);
      const { request } = await repo.wallet.createRequest(
        requestInput(bob, alice, 450)
      );
      subject.clock.advance(7 * DAY - 1);
      expect((await repo.wallet.getRequest(request.id))!.status).toBe(
        "pending"
      );
      subject.clock.advance(1);

      expect((await repo.wallet.getRequest(request.id))!.status).toBe(
        "expired"
      );
      await expect(
        repo.wallet.payRequest(payInput(alice, request.id))
      ).rejects.toThrow("This request expired");
      await expect(
        repo.wallet.closeRequest(request.id, "alice_test", "decline")
      ).rejects.toBeInstanceOf(InvalidStateError);
      const query = (status: "pending" | "expired") =>
        repo.wallet.listRequests("bob_test", { role: "outgoing", status });
      expect(await query("pending")).toEqual([]);
      expect((await query("expired")).map((r) => r.id)).toEqual([request.id]);
      expect(
        (await repo.wallet.getLimits("bob_test")).pendingRequestsLeft
      ).toBe(10);
    });

    it("allows 10 pending outgoing requests at a time", async () => {
      const ids: string[] = [];
      for (let i = 0; i < 10; i++) {
        ids.push(
          (await repo.wallet.createRequest(requestInput(bob, alice, 100 + i)))
            .request.id
        );
      }
      await expect(
        repo.wallet.createRequest(requestInput(bob, alice, 500))
      ).rejects.toThrow(/10 pending requests/);
      expect(
        (await repo.wallet.getLimits("bob_test")).pendingRequestsLeft
      ).toBe(0);

      await repo.wallet.closeRequest(ids[0], "bob_test", "cancel");
      await expect(
        repo.wallet.createRequest(requestInput(bob, alice, 500))
      ).resolves.toBeDefined();
      // Listed newest first (same time: by id).
      const listed = await repo.wallet.listRequests("bob_test", {
        role: "outgoing",
      });
      expect(listed).toHaveLength(11);
    });

    it("replays a request and refuses asking yourself", async () => {
      const input = requestInput(bob, alice, 450, { key: "request-key-1" });
      const first = await repo.wallet.createRequest(input);
      const again = await repo.wallet.createRequest(input);
      expect(again).toEqual({ request: first.request, replayed: true });
      await expect(
        repo.wallet.createRequest(
          requestInput(bob, alice, 451, { key: "request-key-1" })
        )
      ).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
      await expect(
        repo.wallet.createRequest(requestInput(bob, bob, 450))
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("freezes", () => {
    it("stop a frozen wallet from sending, receiving, requesting and topping up", async () => {
      await fundAlice(2_000);
      await repo.wallet.topUp(topUpInput(bob, 2_500));
      const pending = (
        await repo.wallet.createRequest(requestInput(bob, alice, 300))
      ).request;
      subject.freeze("ALICE_TEST", true);

      expect((await repo.wallet.getWallet("alice_test")).frozen).toBe(true);
      for (const attempt of [
        () => repo.wallet.send(sendInput(alice, bob, 100)),
        () => repo.wallet.send(sendInput(bob, alice, 100)),
        () => repo.wallet.topUp(topUpInput(alice, 2_500)),
        () => repo.wallet.createRequest(requestInput(alice, bob, 100)),
        () => repo.wallet.createRequest(requestInput(bob, alice, 100)),
        () => repo.wallet.payRequest(payInput(alice, pending.id)),
      ]) {
        await expect(attempt()).rejects.toBeInstanceOf(WalletFrozenError);
      }
      expect(await balance(alice)).toBe(2_000);

      subject.freeze("alice_test", false);
      await repo.wallet.send(sendInput(alice, bob, 100));
      expect(await balance(alice)).toBe(1_900);
      await expectLedgerInvariants(subject);
    });
  });

  describe("holds and refunds", () => {
    it("keep a held credit pending and unspendable until it is released", async () => {
      await fundAlice(2_500);
      await heldPayment(subject, {
        id: "held-1",
        from: alice,
        to: shop,
        amount: 900,
        holdUntil: minutesFrom(subject, 10),
      });
      expect(await repo.wallet.getWallet("shop_test")).toEqual({
        username: "shop_test",
        balance: 900,
        pending: 900,
        available: 0,
        frozen: false,
      });
      await expect(
        repo.wallet.send(sendInput(shop, bob, 100))
      ).rejects.toMatchObject({
        available: 0,
        required: 100,
      });
      await expectLedgerInvariants(subject);

      subject.clock.advance(10 * MINUTE);
      expect(await repo.wallet.getWallet("shop_test")).toMatchObject({
        pending: 0,
        available: 900,
      });
      await repo.wallet.send(sendInput(shop, bob, 100));
      await expectLedgerInvariants(subject);
    });

    it("refund a held credit once, inside the window", async () => {
      await fundAlice(2_500);
      const held = await heldPayment(subject, {
        id: "held-2",
        from: alice,
        to: shop,
        amount: 900,
        holdUntil: minutesFrom(subject, 10),
      });
      subject.clock.advance(5 * MINUTE);
      const refund = await reverseTransfer(subject, held);

      expect(refund).toMatchObject({
        id: "refund-held-2",
        kind: "order_refund",
        from: shop,
        to: alice,
        amount: 900,
        reverses: "held-2",
      });
      expect((await repo.wallet.getTransfer("held-2"))!.reversedBy).toBe(
        "refund-held-2"
      );
      expect(await repo.wallet.getWallet("shop_test")).toMatchObject({
        balance: 0,
        pending: 0,
      });
      expect(await balance(alice)).toBe(2_500);

      // The natural id makes a retried refund a replay...
      expect(await reverseTransfer(subject, held)).toEqual(refund);
      // ...and any other refund of it is refused.
      await expect(
        commitTransfers(subject, [{ ...refund, id: "refund-again" }])
      ).rejects.toThrow("This payment was already refunded");
      await expectLedgerInvariants(subject);
    });

    it("refuse a refund once the window is over", async () => {
      await fundAlice(2_500);
      const held = await heldPayment(subject, {
        id: "held-3",
        from: alice,
        to: shop,
        amount: 900,
        holdUntil: minutesFrom(subject, 10),
      });
      subject.clock.advance(10 * MINUTE);
      await expect(reverseTransfer(subject, held)).rejects.toThrow(
        "The refund window is over"
      );
      expect(await balance(shop)).toBe(900);
      await expectLedgerInvariants(subject);
    });

    it.runIf(name === "sanity")(
      "refuse a refund whose hold ends, and is spent, before it commits",
      async () => {
        await fundAlice(2_500);
        const holdUntil = minutesFrom(subject, 10);
        const held = await heldPayment(subject, {
          id: "held-race",
          from: alice,
          to: shop,
          amount: 900,
          holdUntil,
        });
        // The refund reads inside the window; the hold ends and the
        // released credits are spent before its transaction lands.
        subject.clock.set(new Date(Date.parse(holdUntil) - 1).toISOString());
        const client = subject.client!;
        let competitors = 0;
        client.beforeMutate = async () => {
          if (competitors++ > 0) return;
          subject.clock.advance(5);
          await repo.wallet.send(sendInput(shop, bob, 900));
        };
        const refused = reverseTransfer(subject, held);
        await expect(refused).rejects.toBeInstanceOf(InvalidStateError);
        await expect(refused).rejects.toThrow("The refund window is over");
        client.beforeMutate = undefined;

        expect(competitors).toBe(1);
        expect((await repo.wallet.getTransfer("held-race"))!.reversedBy).toBe(
          null
        );
        expect(await balance(shop)).toBe(0);
        expect(await balance(bob)).toBe(900);
        expect(await balance(alice)).toBe(1_600);
        await expectLedgerInvariants(subject);
      }
    );

    it("reach frozen wallets in both directions", async () => {
      await fundAlice(2_500);
      const held = await heldPayment(subject, {
        id: "held-4",
        from: alice,
        to: shop,
        amount: 900,
        holdUntil: minutesFrom(subject, 10),
      });
      subject.freeze("alice_test", true);
      subject.freeze("shop_test", true);
      await reverseTransfer(subject, held);
      expect(await balance(alice)).toBe(2_500);
      expect(await balance(shop)).toBe(0);
      await expectLedgerInvariants(subject);
    });
  });

  describe("concurrency", () => {
    it("never double-spends under concurrent sends", async () => {
      await fundAlice(1_000);
      if (subject.client) {
        // Every operation reads its snapshot before any of them commits.
        subject.client.fetchDelay = () =>
          new Promise((resolve) => setImmediate(resolve));
      }
      const outcomes = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          repo.wallet.send(sendInput(alice, bob, 300))
        )
      );
      if (subject.client) subject.client.fetchDelay = undefined;

      const succeeded = outcomes.filter((o) => o.status === "fulfilled").length;
      const after = await balance(alice);
      expect(after).toBe(1_000 - 300 * succeeded);
      expect(after).toBeGreaterThanOrEqual(0);
      for (const outcome of outcomes) {
        if (outcome.status === "rejected") {
          expect(
            outcome.reason instanceof InsufficientFundsError ||
              outcome.reason instanceof ConflictError,
            String(outcome.reason)
          ).toBe(true);
        }
      }
      if (name === "memory") {
        expect(succeeded).toBe(3);
        expect(after).toBe(100);
      } else {
        expect(succeeded).toBeGreaterThanOrEqual(1);
      }
      await expectLedgerInvariants(subject);
    });

    it("counts top-ups exactly under concurrent requests", async () => {
      if (subject.client) {
        subject.client.fetchDelay = () =>
          new Promise((resolve) => setImmediate(resolve));
      }
      await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          repo.wallet.topUp(topUpInput(alice, 2_500))
        )
      );
      if (subject.client) subject.client.fetchDelay = undefined;
      const { items } = await repo.wallet.listActivity("alice_test");
      expect(items.length).toBeLessThanOrEqual(3);
      expect(await balance(alice)).toBe(items.length * 2_500);
      await expectLedgerInvariants(subject);
    });

    it("counts pending requests exactly under concurrent requests", async () => {
      for (let i = 0; i < 8; i++)
        await repo.wallet.createRequest(requestInput(bob, alice, 100 + i));
      // No credits move, so only the wallet lock (§6.9) keeps the count
      // exact: every operation reads 8 pending before any of them commits.
      if (subject.client) {
        subject.client.fetchDelay = () =>
          new Promise((resolve) => setImmediate(resolve));
      }
      const outcomes = await Promise.allSettled(
        Array.from({ length: 5 }, (_, i) =>
          repo.wallet.createRequest(requestInput(bob, alice, 200 + i))
        )
      );
      if (subject.client) subject.client.fetchDelay = undefined;

      const pending = (
        await repo.wallet.listRequests("bob_test", { role: "outgoing" })
      ).filter((request) => request.status === "pending");
      expect(pending).toHaveLength(10);
      expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(2);
      for (const outcome of outcomes) {
        if (outcome.status === "rejected") {
          expect(
            outcome.reason instanceof LimitExceededError ||
              outcome.reason instanceof ConflictError,
            String(outcome.reason)
          ).toBe(true);
        }
      }
      expect(
        (await repo.wallet.getLimits("bob_test")).pendingRequestsLeft
      ).toBe(0);
      await expectLedgerInvariants(subject);
    });

    it.runIf(name === "sanity")(
      "re-checks funds after a competing write wins the race",
      async () => {
        await fundAlice(1_000);
        const client = subject.client!;
        let competitors = 0;
        client.beforeMutate = async () => {
          if (competitors++ > 0) return;
          await repo.wallet.send(sendInput(alice, carol, 500));
        };
        await expect(
          repo.wallet.send(sendInput(alice, bob, 800))
        ).rejects.toMatchObject({ available: 500, required: 800 });
        client.beforeMutate = undefined;

        expect(competitors).toBe(1);
        expect(await balance(alice)).toBe(500);
        await expectLedgerInvariants(subject);
      }
    );

    it.runIf(name === "sanity")(
      "retries a conflict and succeeds when funds still cover it",
      async () => {
        await fundAlice(1_000);
        const client = subject.client!;
        let competitors = 0;
        client.beforeMutate = async () => {
          if (competitors++ > 0) return;
          await repo.wallet.send(sendInput(alice, carol, 100));
        };
        const before = client.mutationLog.length;
        await repo.wallet.send(sendInput(alice, bob, 800));
        client.beforeMutate = undefined;

        // The competitor's transaction, then ours on the second attempt.
        expect(client.mutationLog.length - before).toBe(2);
        expect(await balance(alice)).toBe(100);
        await expectLedgerInvariants(subject);
      }
    );

    it.runIf(name === "sanity")(
      "gives up with ConflictError after 3 conflicts, writing nothing",
      async () => {
        await fundAlice(1_000);
        const client = subject.client!;
        const before = client.mutationLog.length;
        const input = sendInput(alice, bob, 300);

        client.injectConflicts(3);
        await expect(repo.wallet.send(input)).rejects.toBeInstanceOf(
          ConflictError
        );
        expect(client.mutationLog.length).toBe(before);
        expect(await repo.wallet.getTransfer(input.operationId)).toBeNull();
        expect(await balance(alice)).toBe(1_000);

        client.injectConflicts(2);
        await repo.wallet.send(input);
        expect(client.mutationLog.length).toBe(before + 1);
        expect(await balance(alice)).toBe(700);
      }
    );

    it.runIf(name === "sanity")(
      "replays when a concurrent request with the same key committed first",
      async () => {
        await fundAlice(1_000);
        const client = subject.client!;
        const input = sendInput(alice, bob, 300);
        let competitors = 0;
        client.beforeMutate = async () => {
          if (competitors++ > 0) return;
          await repo.wallet.send(input);
        };
        const result = await repo.wallet.send(input);
        client.beforeMutate = undefined;
        expect(result.replayed).toBe(true);
        expect(await balance(alice)).toBe(700);
      }
    );

    // Cancel and decline never write a wallet, so only the request's
    // revision guard keeps its status in step with the ledger when they race
    // a payment.
    for (const [closer, action, status] of [
      [bob, "cancel", "cancelled"],
      [alice, "decline", "declined"],
    ] as const) {
      it.runIf(name === "sanity")(
        `refuses a payment when the request is ${status} before it commits`,
        async () => {
          await fundAlice(1_000);
          const { request } = await repo.wallet.createRequest(
            requestInput(bob, alice, 500)
          );
          const client = subject.client!;
          let competitors = 0;
          client.beforeMutate = async () => {
            if (competitors++ > 0) return;
            await repo.wallet.closeRequest(request.id, closer.username, action);
          };
          const refused = repo.wallet.payRequest(payInput(alice, request.id));
          await expect(refused).rejects.toBeInstanceOf(InvalidStateError);
          await expect(refused).rejects.toThrow(`This request was ${status}`);
          client.beforeMutate = undefined;

          expect(competitors).toBe(1);
          expect(await repo.wallet.getRequest(request.id)).toMatchObject({
            status,
            transferId: null,
          });
          expect(await balance(alice)).toBe(1_000);
          expect(await balance(bob)).toBe(0);
          await expectLedgerInvariants(subject);
        }
      );

      it.runIf(name === "sanity")(
        `refuses to ${action} a request paid before the ${action} commits`,
        async () => {
          await fundAlice(1_000);
          const { request } = await repo.wallet.createRequest(
            requestInput(bob, alice, 500)
          );
          const pay = payInput(alice, request.id);
          const client = subject.client!;
          let competitors = 0;
          client.beforeMutate = async () => {
            if (competitors++ > 0) return;
            await repo.wallet.payRequest(pay);
          };
          const refused = repo.wallet.closeRequest(
            request.id,
            closer.username,
            action
          );
          await expect(refused).rejects.toBeInstanceOf(InvalidStateError);
          await expect(refused).rejects.toThrow(
            "This request was already paid"
          );
          client.beforeMutate = undefined;

          expect(competitors).toBe(1);
          expect(await repo.wallet.getRequest(request.id)).toMatchObject({
            status: "paid",
            transferId: pay.operationId,
          });
          expect(await balance(alice)).toBe(500);
          expect(await balance(bob)).toBe(500);
          await expectLedgerInvariants(subject);
        }
      );
    }

    it.runIf(name === "sanity")(
      "writes every money operation in exactly one transaction",
      async () => {
        const client = subject.client!;
        const step = async (run: () => Promise<unknown>) => {
          const before = client.mutationLog.length;
          await run();
          expect(client.mutationLog.length - before).toBe(1);
        };
        await step(() => repo.wallet.topUp(topUpInput(alice, 2_500)));
        await step(() => repo.wallet.send(sendInput(alice, bob, 500)));
        await step(() => repo.wallet.send(tipInput(alice, marco, "seed-t04")));
        let id = "";
        await step(async () => {
          id = (await repo.wallet.createRequest(requestInput(bob, alice, 450)))
            .request.id;
        });
        const pay = payInput(alice, id);
        await step(() => repo.wallet.payRequest(pay));
        const other = (
          await repo.wallet.createRequest(requestInput(bob, alice, 300))
        ).request;
        await step(() =>
          repo.wallet.closeRequest(other.id, "alice_test", "decline")
        );

        // Replays and no-ops only read.
        const before = client.mutationLog.length;
        expect((await repo.wallet.payRequest(pay)).replayed).toBe(true);
        await repo.wallet.closeRequest(other.id, "alice_test", "decline");
        expect(client.mutationLog.length).toBe(before);
      }
    );
  });

  describe("activity", () => {
    it("pages newest first by (createdAt, id) without gaps or duplicates", async () => {
      await repo.wallet.topUp(topUpInput(alice, 10_000));
      for (let i = 0; i < 7; i++) {
        // Pairs share a timestamp, so ties are broken by id.
        if (i % 2 === 0) subject.clock.advance(MINUTE);
        await repo.wallet.send(sendInput(alice, i % 3 ? bob : carol, 100 + i));
      }
      subject.clock.advance(MINUTE);
      await repo.wallet.send(sendInput(bob, alice, 50));

      const all = (await repo.wallet.listActivity("alice_test", { limit: 50 }))
        .items;
      expect(all).toHaveLength(9);
      expect(all[all.length - 1].kind).toBe("issue");
      expect(all[0]).toMatchObject({ from: bob, to: alice, amount: 50 });

      const paged = [];
      let cursor: string | null = null;
      do {
        const page = await repo.wallet.listActivity("ALICE_TEST", {
          limit: 2,
          cursor,
        });
        expect(page.items.length).toBeLessThanOrEqual(2);
        paged.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor);
      expect(paged).toEqual(all);

      for (let i = 1; i < all.length; i++) {
        const [a, b] = [all[i - 1], all[i]];
        const newer = Date.parse(a.createdAt) - Date.parse(b.createdAt);
        expect(newer > 0 || (newer === 0 && a.id > b.id)).toBe(true);
      }
      expect(
        (
          await repo.wallet.listActivity("alice_test", {
            limit: 3,
            cursor: "garbage",
          })
        ).items
      ).toEqual(all.slice(0, 3));
    });
  });

  describe("tips on Tweets", () => {
    it("count for everyone and mark the viewer's own", async () => {
      const before = (await repo.getTweet("seed-t04", "lenaframes"))!.stats
        .tips;
      const { transfer } = await repo.wallet.send(
        tipInput(sarah, marco, "seed-t04")
      );
      expect(transfer).toMatchObject({
        kind: "tip",
        context: { type: "tweet", id: "seed-t04" },
      });

      const seen = await repo.getTweet("seed-t04", "SarahCodes");
      expect(seen!.stats.tips).toBe(before + 1);
      expect(seen!.viewer.tipped).toBe(true);
      expect(
        (await repo.getTweet("seed-t04", "lenaframes"))!.viewer.tipped
      ).toBe(false);
      expect((await repo.getTweet("seed-t04"))!.viewer.tipped).toBe(false);

      const { items } = await repo.listTweets({
        author: "devmarco",
        viewer: "sarahcodes",
      });
      expect(items.find((t) => t.id === "seed-t04")).toMatchObject({
        stats: { tips: before + 1 },
        viewer: { tipped: true },
      });
      const seeded = await repo.getTweet("seed-t03", DEMO_USERNAME);
      expect(seeded).toMatchObject({
        stats: { tips: 2 },
        viewer: { tipped: true },
      });
    });

    it("survive deleting the Tweet", async () => {
      const { transfer } = await repo.wallet.send(
        tipInput(sarah, marco, "seed-t04")
      );
      expect(await repo.deleteTweet("seed-t04")).toBe(true);

      expect(await repo.wallet.getTransfer(transfer.id)).toEqual(transfer);
      const notifications = await repo.wallet.notifications("devmarco", 50);
      expect(
        notifications.find((n) => n.id === `tip-${transfer.id}`)
      ).toMatchObject({
        type: "tip",
        tweet: null,
        amount: 200,
      });
      await expectLedgerInvariants(subject);
    });

    it("leave attachments null while the shop is off", async () => {
      // Pinned off: the shop lane turns it on when it ships.
      const [, withoutShop] = subjects({ disabled: ["shop"] }).find(
        ([store]) => store === name
      )!;
      const { repo } = withoutShop();
      const tweet = await repo.createTweet({
        text: "Try the latte",
        author: sarah,
        attachment: { type: "product", productId: "seed-p-kk-latte" },
      });
      expect(tweet.attachment).toBeNull();
      expect((await repo.getTweet(tweet.id))!.attachment).toBeNull();
    });
  });

  describe("notifications", () => {
    it("merge into the timeline, newest first, with stable ids", async () => {
      const all = await repo.listNotifications(DEMO_USERNAME, 50);
      const ids = all.map((n) => n.id);
      expect(ids).toEqual(
        expect.arrayContaining([
          "tip-seed-tx02",
          "pay-seed-tx03",
          "preq-paid-seed-req02",
          "preq-seed-req01",
          "preq-seed-req03",
          "preq-seed-req04",
        ])
      );
      const times = all.map((n) => Date.parse(n.createdAt));
      expect([...times].sort((a, b) => b - a)).toEqual(times);
      expect(new Set(ids).size).toBe(ids.length);

      expect(all.find((n) => n.id === "tip-seed-tx02")).toEqual({
        id: "tip-seed-tx02",
        type: "tip",
        createdAt: "2026-10-08T09:30:00.000Z",
        actor: sarah,
        tweet: {
          id: "seed-t05",
          text: "Rebuilt the data layer of the SuperApp with a repository pattern: Sanity in production, an in-memory store for local dev. #NextJS #TypeScript",
        },
        amount: 200,
        transferId: "seed-tx02",
      });
      expect(all.find((n) => n.id === "pay-seed-tx03")).toEqual({
        id: "pay-seed-tx03",
        type: "payment",
        createdAt: "2026-10-08T09:00:00.000Z",
        actor: marco,
        amount: 1_500,
        note: "Thanks for the code review 🙏",
        transferId: "seed-tx03",
        conversationId: "dm-devmarco-illlhanozkan",
      });

      // Only the recipient is told: Sarah doesn't hear about Marco's payment.
      expect(
        (await repo.listNotifications("sarahcodes", 50)).map((n) => n.id)
      ).not.toContain("pay-seed-tx03");

      subject.clock.advance(MINUTE);
      const { transfer } = await repo.wallet.send(
        tipInput(sarah, me, "seed-t05")
      );
      expect(
        (await repo.listNotifications(DEMO_USERNAME, 1)).map((n) => n.id)
      ).toEqual([`tip-${transfer.id}`]);
    });

    it("tell the requester when a request is paid or declined", async () => {
      await fundAlice(2_000);
      const paid = (
        await repo.wallet.createRequest(requestInput(bob, alice, 450))
      ).request;
      const declined = (
        await repo.wallet.createRequest(requestInput(bob, alice, 300))
      ).request;
      subject.clock.advance(MINUTE);
      await repo.wallet.payRequest(payInput(alice, paid.id));
      subject.clock.advance(MINUTE);
      await repo.wallet.closeRequest(declined.id, "alice_test", "decline");

      expect(
        (await repo.wallet.notifications("bob_test", 10)).map((n) => n.type)
      ).toEqual(["request_declined", "request_paid"]);
      expect(
        (await repo.wallet.notifications("alice_test", 10)).map((n) => n.type)
      ).toEqual(["payment_request", "payment_request"]);
      expect(await repo.wallet.notifications("alice_test", 0)).toEqual([]);
    });
  });
});

describe("stores agree on the wallet", () => {
  it("for seeded reads", async () => {
    await expectStoresAgree((repo: Repository) =>
      Promise.all([
        repo.wallet.getWallet(DEMO_USERNAME),
        repo.wallet.getWallet("lenaframes"),
        repo.wallet.getLimits(DEMO_USERNAME),
        repo.wallet.listActivity(DEMO_USERNAME, { limit: 50 }),
        repo.wallet.listRequests(DEMO_USERNAME, { role: "incoming" }),
        repo.wallet.listRequests(DEMO_USERNAME, { role: "outgoing" }),
        repo.wallet.tipStats(
          ["seed-t02", "seed-t03", "seed-t05"],
          "ayse_design"
        ),
        repo.wallet.notifications(DEMO_USERNAME, 50),
        repo.listNotifications("sarahcodes"),
        repo.wallet.audit(),
        repo.searchUsers("a", 20),
      ])
    );
  });

  it("after writes", async () => {
    await expectStoresAgree(
      (repo: Repository) =>
        Promise.all([
          repo.wallet.getWallet("alice_test"),
          repo.wallet.getWallet("bob_test"),
          repo.wallet.listActivity("alice_test", { limit: 50 }),
          repo.wallet.listRequests("bob_test", { role: "outgoing" }),
          repo.wallet.notifications("bob_test", 50),
          repo.listTweets({ viewer: "alice_test", author: "devmarco" }),
        ]),
      {
        prepare: async ({ repo, clock }) => {
          await repo.wallet.topUp(topUpInput(alice, 5_000, "agree-1"));
          clock.advance(MINUTE);
          await repo.wallet.send(
            sendInput(alice, bob, 700, { key: "agree-2" })
          );
          await repo.wallet.send(
            sendInput(alice, marco, 200, {
              key: "agree-3",
              kind: "tip",
              context: { type: "tweet", id: "seed-t04" },
            })
          );
          const { request } = await repo.wallet.createRequest(
            requestInput(bob, alice, 450, { key: "agree-4" })
          );
          clock.advance(MINUTE);
          await repo.wallet.payRequest(payInput(alice, request.id, "agree-5"));
        },
      }
    );
  });

  it("for searchUsers", async () => {
    await expectStoresAgree((repo: Repository) =>
      Promise.all(
        ["a", "kahve", "Sarah Chen", "drive", "_", "zzz"].map((q) =>
          repo.searchUsers(q, 20)
        )
      )
    );
  });
});

describe("memory ledger capacity", () => {
  it("refuses new money movement when the ledger is full, keeping every record", async () => {
    const state = createMemoryState(createSeedData(SUBJECT_NOW));
    const capacity = state.wallet.transfers.size + 1;
    const repo = createMemoryRepository(state, {
      now: () => SUBJECT_NOW,
      limits: { transfers: capacity },
    });

    await repo.wallet.topUp(topUpInput(alice, 2_500));
    await expect(repo.wallet.topUp(topUpInput(alice, 2_500))).rejects.toThrow(
      "The demo ledger is full; restart the server"
    );
    await expect(
      repo.wallet.send(sendInput(alice, bob, 100))
    ).rejects.toBeInstanceOf(LimitExceededError);
    expect(state.wallet.transfers.size).toBe(capacity);
    expect((await repo.wallet.getWallet("alice_test")).balance).toBe(2_500);
    // Requests move no money, so they still work.
    await expect(
      repo.wallet.createRequest(requestInput(bob, alice, 450))
    ).resolves.toBeDefined();
    expect((await repo.wallet.audit()).ok).toBe(true);
  });

  it("refuses new payment requests when the store is full, still replaying", async () => {
    const state = createMemoryState(createSeedData(SUBJECT_NOW));
    const capacity = state.wallet.requests.size + 1;
    const repo = createMemoryRepository(state, {
      now: () => SUBJECT_NOW,
      limits: { paymentRequests: capacity },
    });

    const first = requestInput(bob, alice, 450);
    const { request } = await repo.wallet.createRequest(first);
    const refused = repo.wallet.createRequest(requestInput(bob, alice, 300));
    await expect(refused).rejects.toBeInstanceOf(LimitExceededError);
    await expect(refused).rejects.toThrow(
      "The demo store is full; restart the server"
    );
    expect(state.wallet.requests.size).toBe(capacity);
    expect(await repo.wallet.createRequest(first)).toEqual({
      request,
      replayed: true,
    });
    // Paying stores no new request, so it still works.
    await repo.wallet.topUp(topUpInput(alice, 2_500));
    await expect(
      repo.wallet.payRequest(payInput(alice, request.id))
    ).resolves.toMatchObject({ request: { status: "paid" } });
    expect((await repo.wallet.audit()).ok).toBe(true);
  });
});

describe("Sanity privacy", () => {
  it("exposes no private document of the superapp world to anonymous reads", async () => {
    const [, createSanity] = subjects()[1];
    const { client, repo } = createSanity();

    client!.anonymous = true;
    expect(await exposedPrivateDocuments(client!)).toEqual([]);
    expect((await repo.wallet.getWallet(DEMO_USERNAME)).balance).toBe(0);
    expect(await repo.wallet.getTransfer("seed-tx01")).toBeNull();
    expect(await repo.wallet.getRequest("seed-req01")).toBeNull();

    client!.anonymous = false;
    expect(await exposedPrivateDocuments(client!)).not.toEqual([]);
    expect(
      (await repo.wallet.getWallet(DEMO_USERNAME)).balance
    ).toBeGreaterThan(0);
  });

  it("excludes drafts from every SuperApp read", async () => {
    const [, createSanity] = subjects()[1];
    const { client, repo } = createSanity();
    const wallet = client!.documents.find(
      (d) => d._id === "private.wallet-illlhanozkan"
    )!;
    client!.documents.push({
      ...wallet,
      _id: "drafts.private.wallet-illlhanozkan",
      balance: 999_999,
    });
    client!.documents.push({
      ...client!.documents.find((d) => d._id === "private.seed-tx02")!,
      _id: "drafts.seed-tx99",
    });
    expect((await repo.wallet.getWallet(DEMO_USERNAME)).balance).toBe(
      wallet.balance
    );
    expect(
      (await repo.wallet.tipStats(["seed-t05"], null)).get("seed-t05")!.tips
    ).toBe(1);
  });
});

// A seeded random run: the same 300 operations (sends, tips, top-ups,
// requests, payments, closes, freezes, time passing, held credits and
// refunds, and repeats of earlier operations) replayed against both stores
// must give identical results and leave both ledgers sound.

const PEOPLE: IAuthor[] = [me, sarah, marco, alice, bob, carol, shop];
const AMOUNTS = [30, 50, 199, 450, 1_500, 5_000, 12_000, 25_000];
const TOP_UPS = [2_500, 5_000, 10_000, 1_234];
const ADVANCES = [MINUTE, 10 * MINUTE, 60 * MINUTE, DAY, 3 * DAY];
const TWEETS = ["seed-t01", "seed-t03", "seed-t05", "seed-t21"];

type Op =
  | {
      type: "send";
      kind: "payment" | "tip";
      from: number;
      to: number;
      amount: number;
      tweet: string;
      key: string;
    }
  | { type: "topUp"; to: number; amount: number; key: string }
  | {
      type: "request";
      requester: number;
      payer: number;
      amount: number;
      key: string;
    }
  | { type: "pay"; payer: number; request: string; key: string }
  | {
      type: "close";
      actor: number;
      request: string;
      action: "decline" | "cancel";
    }
  | { type: "freeze"; user: number; frozen: boolean }
  | { type: "advance"; ms: number }
  | {
      type: "hold";
      id: string;
      from: number;
      to: number;
      amount: number;
      minutes: number;
    }
  | { type: "refund"; id: string }
  | { type: "repeat"; index: number };

function generateOps(random: () => number, count: number): Op[] {
  const index = (length: number) => Math.floor(random() * length);
  const pick = <T>(items: readonly T[]) => items[index(items.length)];
  const person = () => index(PEOPLE.length);
  const meIndex = PEOPLE.indexOf(me);
  // Requests with their parties, so most payments and closes are by the right person.
  const requests = [
    { id: "seed-req01", requester: PEOPLE.indexOf(sarah), payer: meIndex },
    { id: "seed-req03", requester: PEOPLE.indexOf(marco), payer: meIndex },
    { id: "seed-req04", requester: -1, payer: meIndex },
  ];
  const holds: string[] = [];
  const ops: Op[] = [];
  let keys = 0;
  const key = () => `prop-key-${++keys}`;

  for (let i = 0; i < count; i++) {
    const roll = random();
    if (roll < 0.24) {
      ops.push({
        type: "send",
        kind: random() < 0.3 ? "tip" : "payment",
        from: person(),
        to: person(),
        amount: pick(AMOUNTS),
        tweet: pick(TWEETS),
        key: key(),
      });
    } else if (roll < 0.34) {
      ops.push({
        type: "topUp",
        to: person(),
        amount: pick(TOP_UPS),
        key: key(),
      });
    } else if (roll < 0.46) {
      const op = {
        type: "request" as const,
        requester: person(),
        payer: person(),
        amount: pick(AMOUNTS),
        key: key(),
      };
      ops.push(op);
      requests.push({
        id: operationId(
          "req",
          PEOPLE[op.requester].username,
          "wallet.request",
          op.key
        ),
        requester: op.requester,
        payer: op.payer,
      });
    } else if (roll < 0.56) {
      const request = pick(requests);
      ops.push({
        type: "pay",
        payer: random() < 0.8 ? request.payer : person(),
        request: request.id,
        key: key(),
      });
    } else if (roll < 0.62) {
      const request = pick(requests);
      const decline = random() < 0.5;
      const right = decline ? request.payer : request.requester;
      ops.push({
        type: "close",
        actor: random() < 0.8 && right >= 0 ? right : person(),
        request: request.id,
        action: decline ? "decline" : "cancel",
      });
    } else if (roll < 0.66) {
      ops.push({ type: "freeze", user: person(), frozen: random() < 0.4 });
    } else if (roll < 0.74) {
      ops.push({ type: "advance", ms: pick(ADVANCES) });
    } else if (roll < 0.82) {
      const id = `prop-hold-${i}`;
      holds.push(id);
      ops.push({
        type: "hold",
        id,
        from: person(),
        to: person(),
        amount: pick(AMOUNTS),
        minutes: pick([5, 30, 120]),
      });
    } else if (roll < 0.9 && holds.length > 0) {
      ops.push({ type: "refund", id: pick(holds) });
    } else if (i > 0) {
      ops.push({ type: "repeat", index: index(i) });
    } else {
      ops.push({ type: "advance", ms: MINUTE });
    }
  }
  return ops;
}

type Outcome = { op: Op["type"]; result?: unknown; error?: string };

async function runOp(subject: Subject, op: Op, ops: Op[]): Promise<Outcome> {
  const { repo } = subject;
  const run = async (): Promise<unknown> => {
    switch (op.type) {
      case "send":
        return repo.wallet.send(
          sendInput(PEOPLE[op.from], PEOPLE[op.to], op.amount, {
            key: op.key,
            kind: op.kind,
            context: op.kind === "tip" ? { type: "tweet", id: op.tweet } : null,
          })
        );
      case "topUp":
        return repo.wallet.topUp(topUpInput(PEOPLE[op.to], op.amount, op.key));
      case "request":
        return repo.wallet.createRequest(
          requestInput(PEOPLE[op.requester], PEOPLE[op.payer], op.amount, {
            key: op.key,
          })
        );
      case "pay":
        return repo.wallet.payRequest(
          payInput(PEOPLE[op.payer], op.request, op.key)
        );
      case "close":
        return repo.wallet.closeRequest(
          op.request,
          PEOPLE[op.actor].username,
          op.action
        );
      case "freeze":
        return subject.freeze(PEOPLE[op.user].username, op.frozen);
      case "advance":
        return subject.clock.advance(op.ms);
      case "hold":
        return heldPayment(subject, {
          id: op.id,
          from: PEOPLE[op.from],
          to: PEOPLE[op.to],
          amount: op.amount,
          holdUntil: minutesFrom(subject, op.minutes),
        });
      case "refund": {
        const original = await repo.wallet.getTransfer(op.id);
        return original ? reverseTransfer(subject, original) : "no such hold";
      }
      case "repeat":
        return (await runOp(subject, ops[op.index], ops)).result;
    }
  };
  try {
    return { op: op.type, result: (await run()) ?? null };
  } catch (error) {
    const { name, message } = error as Error;
    return { op: op.type, error: `${name}: ${message}` };
  }
}

async function everything(repo: Repository) {
  const activity = async (username: string) => {
    const items = [];
    let cursor: string | null = null;
    do {
      const page = await repo.wallet.listActivity(username, {
        limit: 50,
        cursor,
      });
      items.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    return items;
  };
  const { wallets: _stored, ...audit } = await repo.wallet.audit();
  void _stored; // how many wallet documents exist is a storage detail
  return {
    audit,
    people: await Promise.all(
      PEOPLE.map(async ({ username }) => ({
        wallet: await repo.wallet.getWallet(username),
        limits: await repo.wallet.getLimits(username),
        activity: await activity(username),
        incoming: await repo.wallet.listRequests(username, {
          role: "incoming",
        }),
        outgoing: await repo.wallet.listRequests(username, {
          role: "outgoing",
        }),
        notifications: await repo.wallet.notifications(username, 50),
      }))
    ),
  };
}

describe("ledger property", () => {
  it("300 seeded random operations: identical in both stores, invariants hold", async () => {
    const ops = generateOps(mulberry32(42), 300);
    const [memory, sanity] = subjects().map(([, create]) => create());

    const outcomes: Outcome[][] = [];
    for (const subject of [memory, sanity]) {
      const results: Outcome[] = [];
      for (const op of ops) results.push(await runOp(subject, op, ops));
      outcomes.push(results);
      await expectLedgerInvariants(subject);
    }
    for (let i = 0; i < ops.length; i++) {
      expect(
        outcomes[1][i],
        `operation ${i}: ${JSON.stringify(ops[i])}`
      ).toEqual(outcomes[0][i]);
    }
    expect(await everything(sanity.repo)).toEqual(
      await everything(memory.repo)
    );

    // The run exercised every path, not just the refusals.
    const succeeded = (type: Op["type"]) =>
      outcomes[0].filter((o) => o.op === type && !o.error).length;
    const failed = (pattern: RegExp) =>
      outcomes[0].filter((o) => o.error && pattern.test(o.error)).length;
    for (const type of [
      "send",
      "topUp",
      "request",
      "pay",
      "close",
      "hold",
      "refund",
    ] as const) {
      expect(succeeded(type), type).toBeGreaterThan(0);
    }
    expect(
      outcomes[0].filter((o) => (o.result as { replayed?: boolean })?.replayed)
        .length
    ).toBeGreaterThan(0);
    for (const error of [
      /InsufficientFundsError/,
      /WalletFrozenError/,
      /LimitExceededError/,
      /InvalidStateError/,
      /NotFoundError/,
    ]) {
      expect(failed(error), String(error)).toBeGreaterThan(0);
    }
  }, 120_000);
});
