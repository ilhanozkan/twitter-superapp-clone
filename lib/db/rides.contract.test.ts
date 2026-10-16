import { beforeEach, describe, expect, it } from "vitest";

import {
  expectLedgerInvariants,
  expectStoresAgree,
  Subject,
  SUBJECT_NOW,
  subjects,
} from "../../test/repositorySubjects";
import { IRide, RideType } from "../../types/Ride";
import { PlaceId } from "../../types/Superapp";
import { IAuthor } from "../../types/User";
import { fingerprint, operationId } from "../superapp/idempotency";
import { planRideTip, rideFare, rideRoute } from "../superapp/rides";
import {
  ConflictError,
  ForbiddenError,
  IdempotencyKeyReusedError,
  InsufficientFundsError,
  InvalidStateError,
  LimitExceededError,
  NotFoundError,
  PriceChangedError,
  UnavailableError,
  WalletFrozenError,
} from "./errors";
import { createMemoryRepository, createMemoryState } from "./memory";
import { exposedPrivateDocuments } from "./sanity/privacy";
import { createSeedData, DEMO_USERNAME } from "./seed";
import { Repository } from "./types";

// Rides on both stores: quotes, booking with the rider and driver locks,
// the held fare, progress over time, cancelling with a refund, tips through
// the wallet, notifications and live activity, and the ledger invariants
// after every scenario. Riders are fresh accounts (alice_test, ...) funded
// by top-ups, so nothing depends on balances other lanes seed.

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
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
const ahmet = {
  username: "ahmet_drives",
  fullname: "Ahmet Kaya",
  image: "/avatars/ahmet_drives.svg",
};
const alice = author("alice_test", "Alice Test");
const bob = author("bob_test", "Bob Test");
const carol = author("carol_test", "Carol Test");

let keys = 0;
const nextKey = () => `ride-key-${++keys}`;

/** What POST /api/rides would pass for this body. */
function rideInput(
  rider: IAuthor,
  type: RideType,
  {
    from = "kizilay",
    to = "atakule",
    expectedFare,
    key = nextKey(),
  }: {
    from?: PlaceId;
    to?: PlaceId;
    expectedFare?: number;
    key?: string;
  } = {}
) {
  const body = {
    from,
    to,
    type,
    expectedFare:
      expectedFare ?? rideFare(type, rideRoute(from, to).distanceKm),
  };
  return {
    operationId: operationId("ride", rider.username, "rides.book", key),
    fingerprint: fingerprint(body),
    rider,
    ...body,
  };
}

const topUp = (to: IAuthor, key = nextKey()) => {
  return {
    operationId: operationId("tx", to.username, "wallet.topUp", key),
    fingerprint: fingerprint({ amount: 10_000 }),
    to,
    amount: 10_000,
  };
};

const tipKey = (
  from: IAuthor,
  ride: IRide,
  amount: number,
  key = nextKey()
) => ({
  operationId: operationId("tx", from.username, "rides.tip", key),
  fingerprint: fingerprint({ amount, rideId: ride.id }),
});

/** Turns a driver off the way a Studio editor would. */
function setDriverActive(subject: Subject, username: string, active: boolean) {
  if (subject.state) {
    subject.state.rides.drivers.get(username.toLowerCase())!.active = active;
  } else {
    subject.client!.documents.find(
      (document) => document._id === `driverProfile-${username.toLowerCase()}`
    )!.active = active;
  }
}

/** Every operation reads before any of them commits (Sanity). */
function readBeforeCommit(subject: Subject, on: boolean) {
  if (!subject.client) return;
  subject.client.fetchDelay = on
    ? () => new Promise((resolve) => setImmediate(resolve))
    : undefined;
}

describe.each(subjects())("%s rides", (name, create) => {
  let subject: Subject;
  let repo: Repository;

  const wallet = (user: { username: string }) =>
    repo.wallet.getWallet(user.username);
  const book = (rider: IAuthor, type: RideType, opts = {}) =>
    repo.rides.bookRide(rideInput(rider, type, opts));
  const fund = async (...users: IAuthor[]) => {
    for (const user of users) await repo.wallet.topUp(topUp(user));
  };
  const after = (iso: string, ms = 0) =>
    subject.clock.set(new Date(Date.parse(iso) + ms).toISOString());
  const available = async (
    from: PlaceId = "kizilay",
    to: PlaceId = "atakule"
  ) =>
    Object.fromEntries(
      (await repo.rides.quote(from, to)).quotes.map((quote) => [
        quote.type,
        quote.available,
      ])
    );

  beforeEach(() => {
    subject = create();
    repo = subject.repo;
  });

  describe("the seeded world", () => {
    it("serves the drivers and the demo user's completed ride", async () => {
      expect(repo.featureStatus("rides")).toBe("on");
      expect(await repo.rides.getDriver("AHMET_DRIVES")).toEqual({
        ...ahmet,
        vehicle: {
          make: "Toyota",
          model: "Corolla",
          color: "White",
          plate: "06 AK 1234",
        },
        rideType: "economy",
        seats: 4,
      });
      expect(await repo.rides.getDriver("zeynep_xl")).toMatchObject({
        rideType: "xl",
        seats: 6,
        vehicle: { color: "Blue", make: "Ford", model: "Tourneo" },
      });
      expect(await repo.rides.getDriver(DEMO_USERNAME)).toBeNull();

      const ride = (await repo.rides.getRide("seed-ride01"))!;
      expect(ride).toMatchObject({
        id: "seed-ride01",
        rider: me,
        driver: { ...ahmet, rideType: "economy" },
        from: { id: "bahcelievler", name: "Bahçelievler" },
        to: { id: "atakule", name: "Atakule" },
        type: "economy",
        fare: 740,
        distanceKm: 6.4,
        cancelledAt: null,
        paymentTransferId: "seed-tx-ride01",
        refundTransferId: null,
        status: "completed",
        eta: null,
        nextChangeAt: null,
        progress: { leg: null, fraction: 1 },
        canCancel: false,
      });
      expect(Date.parse(ride.dropoffAt)).toBeLessThan(
        SUBJECT_NOW.getTime() - 2 * DAY + MINUTE
      );

      expect(await repo.wallet.getTransfer("seed-tx-ride01")).toMatchObject({
        kind: "ride",
        amount: 740,
        from: me,
        to: ahmet,
        holdUntil: ride.pickupAt,
        context: { type: "ride", id: "seed-ride01", code: ride.code },
      });
      expect((await wallet(ahmet)).pending).toBe(0);

      expect(
        (await repo.rides.listRides({ rider: DEMO_USERNAME })).items.map(
          (r) => r.id
        )
      ).toContain("seed-ride01");
      expect(
        (await repo.rides.listRides({ driver: "ahmet_drives" })).items.map(
          (r) => r.id
        )
      ).toEqual(["seed-ride01"]);
      expect(await repo.rides.liveActivity(DEMO_USERNAME)).toEqual([]);
      expect(await repo.rides.notifications(DEMO_USERNAME, 10)).toEqual([
        {
          id: "ride-completed-seed-ride01",
          type: "ride",
          event: "completed",
          createdAt: ride.dropoffAt,
          actor: ahmet,
          rideId: "seed-ride01",
          destination: "Atakule",
        },
      ]);
      expect(
        (await repo.listNotifications(DEMO_USERNAME, 100)).map((n) => n.id)
      ).toContain("ride-completed-seed-ride01");
    });

    it("reads unknown and malformed ids as missing", async () => {
      expect(await repo.rides.getRide("ride-missing")).toBeNull();
      expect(await repo.rides.getRide("private.seed-ride01")).toBeNull();
      await expect(
        repo.rides.cancelRide({ id: "ride-missing" })
      ).rejects.toThrow(NotFoundError);
    });

    it("passes the ledger invariants", async () => {
      await expectLedgerInvariants(subject);
    });
  });

  describe("quotes", () => {
    it("price every type upfront from the two places", async () => {
      const quote = await repo.rides.quote("kizilay", "atakule");
      expect(quote.distanceKm).toBe(5.1);
      expect(quote.tripMinutes).toBe(8);
      expect(
        quote.quotes.map(({ type, label, seats, fare, available }) => ({
          type,
          label,
          seats,
          fare,
          available,
        }))
      ).toEqual([
        {
          type: "economy",
          label: "Economy",
          seats: 4,
          fare: 630,
          available: true,
        },
        {
          type: "comfort",
          label: "Comfort",
          seats: 4,
          fare: 890,
          available: true,
        },
        { type: "xl", label: "XL", seats: 6, fare: 1110, available: true },
      ]);
      for (const { pickupMinutes } of quote.quotes) {
        expect(pickupMinutes).toBeGreaterThanOrEqual(2);
        expect(pickupMinutes).toBeLessThanOrEqual(5);
      }
    });

    it("reflect busy, frozen and inactive drivers", async () => {
      await fund(alice);
      await book(alice, "comfort");
      subject.freeze("zeynep_xl", true);
      setDriverActive(subject, "elif_rides", false);

      expect(await available()).toEqual({
        economy: true,
        comfort: false,
        xl: false,
      });
      const comfort = (await repo.rides.quote("kizilay", "atakule")).quotes[1];
      expect(comfort).toMatchObject({ available: false, pickupMinutes: null });

      subject.freeze("ahmet_drives", true);
      expect((await available()).economy).toBe(false);
    });
  });

  describe("booking", () => {
    it("pays the driver a credit held until pickup", async () => {
      await fund(alice);
      const driversBefore = await Promise.all(
        ["ahmet_drives", "elif_rides"].map((username) =>
          repo.wallet.getWallet(username)
        )
      );

      const input = rideInput(alice, "economy");
      const {
        ride,
        wallet: after1,
        replayed,
      } = await repo.rides.bookRide(input);

      expect(replayed).toBe(false);
      expect(ride).toMatchObject({
        id: input.operationId,
        rider: alice,
        from: { id: "kizilay" },
        to: { id: "atakule" },
        type: "economy",
        fare: 630,
        distanceKm: 5.1,
        requestedAt: SUBJECT_NOW.toISOString(),
        cancelledAt: null,
        paymentTransferId: `${input.operationId}-1`,
        refundTransferId: null,
        status: "finding",
        eta: ride.pickupAt,
        nextChangeAt: ride.driverAssignedAt,
        canCancel: true,
      });
      expect(ride.code).toMatch(/^[2-9A-HJ-NP-Z]{4}$/);
      expect(["ahmet_drives", "elif_rides"]).toContain(ride.driver.username);
      expect(ride.driver).toMatchObject({ rideType: "economy", seats: 4 });
      expect(after1).toEqual({
        username: "alice_test",
        balance: 10_000 - 630,
        pending: 0,
        available: 10_000 - 630,
        frozen: false,
      });

      const payment = await repo.wallet.getTransfer(ride.paymentTransferId);
      expect(payment).toEqual({
        id: ride.paymentTransferId,
        kind: "ride",
        amount: 630,
        from: alice,
        to: {
          username: ride.driver.username,
          fullname: ride.driver.fullname,
          image: ride.driver.image,
        },
        note: null,
        context: { type: "ride", id: ride.id, code: ride.code },
        createdAt: SUBJECT_NOW.toISOString(),
        holdUntil: ride.pickupAt,
        reversedBy: null,
        reverses: null,
      });

      const index = ride.driver.username === "ahmet_drives" ? 0 : 1;
      const held = await wallet(ride.driver);
      expect(held.balance).toBe(driversBefore[index].balance + 630);
      expect(held.pending).toBe(driversBefore[index].pending + 630);
      await expectLedgerInvariants(subject);

      after(ride.pickupAt);
      const released = await wallet(ride.driver);
      expect(released.pending).toBe(driversBefore[index].pending);
      expect(released.available).toBe(driversBefore[index].available + 630);
      await expectLedgerInvariants(subject);
    });

    it("progresses with the clock and tells the rider when it is done", async () => {
      await fund(alice);
      const { ride } = await book(alice, "xl");
      const read = async () => (await repo.rides.getRide(ride.id))!;
      const live = () => repo.rides.liveActivity("alice_test");
      const done = async () =>
        (await repo.rides.notifications("alice_test", 10)).map((n) => n.id);

      expect(await live()).toEqual([
        {
          kind: "ride",
          id: ride.id,
          title: "Ride to Atakule",
          status: "Finding your driver",
          eta: ride.pickupAt,
          href: `/rides/${ride.id}`,
          nextChangeAt: ride.driverAssignedAt,
        },
      ]);

      after(ride.driverAssignedAt);
      expect((await read()).status).toBe("arriving");
      expect((await live())[0].status).toBe("Zeynep is on the way");

      after(ride.pickupAt, MINUTE);
      expect(await read()).toMatchObject({
        status: "on_trip",
        canCancel: false,
        eta: ride.dropoffAt,
        progress: { leg: "trip" },
      });
      expect((await live())[0]).toMatchObject({
        status: "On the way to Atakule",
        eta: ride.dropoffAt,
      });
      expect(await done()).toEqual([]);

      after(ride.dropoffAt, -1);
      expect(await done()).toEqual([]);
      after(ride.dropoffAt);
      expect((await read()).status).toBe("completed");
      expect(await live()).toEqual([]);
      expect(await done()).toEqual([`ride-completed-${ride.id}`]);
    });

    it("replays the same key once and refuses it with a different body", async () => {
      await fund(alice);
      const input = rideInput(alice, "economy", { key: "same-key-1" });
      const first = await repo.rides.bookRide(input);

      subject.clock.advance(5 * SECOND);
      const again = await repo.rides.bookRide(input);
      expect(again.replayed).toBe(true);
      expect(again.ride.id).toBe(first.ride.id);
      expect(again.ride.requestedAt).toBe(first.ride.requestedAt);
      expect(again.wallet.balance).toBe(first.wallet.balance);
      expect(
        (await repo.rides.listRides({ rider: "alice_test" })).items
      ).toHaveLength(1);

      await expect(
        repo.rides.bookRide(rideInput(alice, "comfort", { key: "same-key-1" }))
      ).rejects.toThrow(IdempotencyKeyReusedError);
      await expectLedgerInvariants(subject);
    });

    it("refuses a stale fare, missing funds and frozen riders, writing nothing", async () => {
      await fund(alice);
      await expect(
        book(alice, "economy", { expectedFare: 600 })
      ).rejects.toMatchObject({
        name: "PriceChangedError",
        expected: 600,
        actual: 630,
      });
      await expect(
        book(alice, "economy", { expectedFare: 600 })
      ).rejects.toThrow(PriceChangedError);

      await expect(book(bob, "economy")).rejects.toMatchObject({
        name: "InsufficientFundsError",
        available: 0,
        required: 630,
      });
      await expect(book(bob, "economy")).rejects.toThrow(
        InsufficientFundsError
      );

      await fund(carol);
      subject.freeze("carol_test", true);
      await expect(book(carol, "economy")).rejects.toThrow(WalletFrozenError);

      for (const rider of ["alice_test", "bob_test", "carol_test"]) {
        expect((await repo.rides.listRides({ rider })).items).toEqual([]);
      }
      expect(await available()).toEqual({
        economy: true,
        comfort: true,
        xl: true,
      });
      await expectLedgerInvariants(subject);
    });

    it("never matches frozen or inactive drivers, or the rider", async () => {
      await fund(alice, bob, carol);
      subject.freeze("ahmet_drives", true);
      const first = await book(alice, "economy");
      expect(first.ride.driver.username).toBe("elif_rides");
      await expect(book(bob, "economy")).rejects.toThrow(UnavailableError);

      setDriverActive(subject, "zeynep_xl", false);
      await expect(book(bob, "xl")).rejects.toThrow(
        "No XL drivers are free nearby"
      );

      // A driver riding with their own type is never their own driver.
      await repo.wallet.topUp(topUp(author("canwheels")));
      await expect(book(author("canwheels"), "comfort")).rejects.toThrow(
        UnavailableError
      );
      await expectLedgerInvariants(subject);
    });

    it("gives one free driver to only one of two concurrent bookings", async () => {
      await fund(alice, bob);
      readBeforeCommit(subject, true);
      const outcomes = await Promise.allSettled([
        book(alice, "comfort"),
        book(bob, "comfort"),
      ]);
      readBeforeCommit(subject, false);

      const booked = outcomes.flatMap((o) =>
        o.status === "fulfilled" ? [o.value.ride] : []
      );
      const refused = outcomes.flatMap((o) =>
        o.status === "rejected" ? [o.reason] : []
      );
      expect(booked).toHaveLength(1);
      expect(booked[0].driver.username).toBe("canwheels");
      expect(refused).toHaveLength(1);
      expect(refused[0]).toBeInstanceOf(UnavailableError);

      const loser = booked[0].rider.username === "alice_test" ? bob : alice;
      expect((await wallet(loser)).balance).toBe(10_000);
      expect(
        (await repo.rides.listRides({ driver: "canwheels" })).items
      ).toHaveLength(1);
      await expectLedgerInvariants(subject);
    });

    it("allows one active ride per rider, exactly under concurrent bookings", async () => {
      await fund(alice);
      readBeforeCommit(subject, true);
      const outcomes = await Promise.allSettled(
        (["economy", "comfort", "xl"] as RideType[]).map((type) =>
          book(alice, type)
        )
      );
      readBeforeCommit(subject, false);

      const booked = outcomes.filter((o) => o.status === "fulfilled");
      expect(booked).toHaveLength(1);
      for (const outcome of outcomes) {
        if (outcome.status === "rejected") {
          expect(
            outcome.reason instanceof InvalidStateError ||
              (name === "sanity" && outcome.reason instanceof ConflictError),
            String(outcome.reason)
          ).toBe(true);
        }
      }
      const { items } = await repo.rides.listRides({ rider: "alice_test" });
      expect(items).toHaveLength(1);
      expect((await wallet(alice)).balance).toBe(10_000 - items[0].fare);

      await expect(book(alice, "economy")).rejects.toThrow(
        "You already have a ride in progress"
      );
      after(items[0].dropoffAt);
      await book(alice, "economy");
      await expectLedgerInvariants(subject);
    });

    it("frees the driver after a cancellation or the drop-off", async () => {
      await fund(alice, bob);
      const first = await book(alice, "comfort");
      expect((await available()).comfort).toBe(false);

      await repo.rides.cancelRide({ id: first.ride.id });
      expect((await available()).comfort).toBe(true);

      const second = await book(bob, "comfort");
      expect(second.ride.driver.username).toBe("canwheels");
      after(second.ride.dropoffAt, -1);
      expect((await available()).comfort).toBe(false);
      after(second.ride.dropoffAt);
      expect((await available()).comfort).toBe(true);
      await book(alice, "comfort");
      await expectLedgerInvariants(subject);
    });
  });

  describe("cancelling", () => {
    it("refunds the fare once before pickup, idempotently", async () => {
      await fund(alice);
      const { ride } = await book(alice, "economy");
      const driverBefore = await wallet(ride.driver);
      subject.clock.advance(10 * SECOND);

      const cancelled = await repo.rides.cancelRide({ id: ride.id });
      const cancelledAt = subject.clock.now().toISOString();
      expect(cancelled.changed).toBe(true);
      expect(cancelled.ride).toMatchObject({
        status: "cancelled",
        cancelledAt,
        refundTransferId: `refund-${ride.paymentTransferId}`,
        canCancel: false,
        eta: null,
        nextChangeAt: null,
      });
      expect(cancelled.ride.stages.at(-1)).toEqual({
        status: "cancelled",
        label: "Ride cancelled",
        at: cancelledAt,
        reached: true,
      });

      expect(
        await repo.wallet.getTransfer(`refund-${ride.paymentTransferId}`)
      ).toEqual({
        id: `refund-${ride.paymentTransferId}`,
        kind: "ride_refund",
        amount: 630,
        from: {
          username: ride.driver.username,
          fullname: ride.driver.fullname,
          image: ride.driver.image,
        },
        to: alice,
        note: null,
        context: { type: "ride", id: ride.id, code: ride.code },
        createdAt: cancelledAt,
        holdUntil: null,
        reversedBy: null,
        reverses: ride.paymentTransferId,
      });
      expect(
        (await repo.wallet.getTransfer(ride.paymentTransferId))!.reversedBy
      ).toBe(`refund-${ride.paymentTransferId}`);
      expect((await wallet(alice)).balance).toBe(10_000);
      const driverAfter = await wallet(ride.driver);
      expect(driverAfter.balance).toBe(driverBefore.balance - 630);
      expect(driverAfter.pending).toBe(driverBefore.pending - 630);

      subject.clock.advance(SECOND);
      const again = await repo.rides.cancelRide({ id: ride.id });
      expect(again.changed).toBe(false);
      expect(again.ride.cancelledAt).toBe(cancelledAt);
      expect((await repo.wallet.listActivity("alice_test")).items).toHaveLength(
        3
      );
      expect(await repo.rides.liveActivity("alice_test")).toEqual([]);
      after(ride.dropoffAt);
      expect(await repo.rides.notifications("alice_test", 10)).toEqual([]);
      await expectLedgerInvariants(subject);
    });

    it("is refused at and after pickup", async () => {
      await fund(alice);
      const { ride } = await book(alice, "economy");
      after(ride.pickupAt, -1);
      expect((await repo.rides.getRide(ride.id))!.canCancel).toBe(true);
      after(ride.pickupAt);
      expect((await repo.rides.getRide(ride.id))!.canCancel).toBe(false);
      await expect(repo.rides.cancelRide({ id: ride.id })).rejects.toThrow(
        InvalidStateError
      );
      after(ride.dropoffAt);
      await expect(repo.rides.cancelRide({ id: ride.id })).rejects.toThrow(
        "can't be cancelled"
      );
      expect((await repo.rides.getRide(ride.id))!.cancelledAt).toBeNull();
      expect((await wallet(alice)).balance).toBe(10_000 - 630);
      await expectLedgerInvariants(subject);
    });

    it("refunds once under concurrent cancels", async () => {
      await fund(alice);
      const { ride } = await book(alice, "xl");
      readBeforeCommit(subject, true);
      const outcomes = await Promise.all(
        Array.from({ length: 3 }, () => repo.rides.cancelRide({ id: ride.id }))
      );
      readBeforeCommit(subject, false);

      expect(outcomes.filter((o) => o.changed)).toHaveLength(1);
      for (const outcome of outcomes) {
        expect(outcome.ride.status).toBe("cancelled");
      }
      expect((await wallet(alice)).balance).toBe(10_000);
      const refunds = (
        await repo.wallet.listActivity("alice_test")
      ).items.filter((t) => t.kind === "ride_refund");
      expect(refunds).toHaveLength(1);
      await expectLedgerInvariants(subject);
    });

    it("reaches a frozen rider and a frozen driver", async () => {
      await fund(alice);
      const { ride } = await book(alice, "comfort");
      subject.freeze("alice_test", true);
      subject.freeze("canwheels", true);
      const { changed } = await repo.rides.cancelRide({ id: ride.id });
      expect(changed).toBe(true);
      expect((await wallet(alice)).balance).toBe(10_000);
      await expectLedgerInvariants(subject);
    });
  });

  describe("tips", () => {
    it("go to the driver through the wallet, after completion only", async () => {
      await fund(alice);
      const { ride } = await book(alice, "economy");
      const read = async () => (await repo.rides.getRide(ride.id))!;

      expect(() =>
        planRideTip(ride, alice, 200, tipKey(alice, ride, 200))
      ).toThrow(InvalidStateError);
      after(ride.pickupAt);
      const onTrip = await read();
      expect(() =>
        planRideTip(onTrip, alice, 200, tipKey(alice, ride, 200))
      ).toThrow("once the ride is complete");

      after(ride.dropoffAt);
      const driverBefore = await wallet(ride.driver);
      const input = planRideTip(
        await read(),
        alice,
        200,
        tipKey(alice, ride, 200, "tip-key-1")
      );
      const { transfer, wallet: walletAfter } = await repo.wallet.send(input);
      expect(transfer).toMatchObject({
        kind: "tip",
        amount: 200,
        from: alice,
        to: { username: ride.driver.username },
        context: { type: "ride", id: ride.id, code: ride.code },
        holdUntil: null,
      });
      expect(walletAfter.balance).toBe(10_000 - 630 - 200);
      expect((await wallet(ride.driver)).balance).toBe(
        driverBefore.balance + 200
      );

      const replay = await repo.wallet.send(input);
      expect(replay.replayed).toBe(true);
      expect((await wallet(alice)).balance).toBe(10_000 - 630 - 200);

      const completed = await read();
      expect(() =>
        planRideTip(completed, bob, 200, tipKey(bob, ride, 200))
      ).toThrow(ForbiddenError);
      await expectLedgerInvariants(subject);
    });
  });

  describe("lists", () => {
    it("page newest first, for riders and drivers", async () => {
      await fund(alice);
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const { ride } = await book(alice, "xl");
        ids.unshift(ride.id);
        after(ride.dropoffAt);
      }

      const first = await repo.rides.listRides({
        rider: "alice_test",
        limit: 2,
      });
      expect(first.items.map((r) => r.id)).toEqual(ids.slice(0, 2));
      expect(first.nextCursor).not.toBeNull();
      const second = await repo.rides.listRides({
        rider: "ALICE_TEST",
        limit: 2,
        cursor: first.nextCursor,
      });
      expect(second.items.map((r) => r.id)).toEqual(ids.slice(2));
      expect(second.nextCursor).toBeNull();
      expect(second.items[0].status).toBe("completed");

      const driven = await repo.rides.listRides({ driver: "zeynep_xl" });
      expect(driven.items.map((r) => r.id)).toEqual(ids);
      expect(
        (
          await repo.rides.listRides({
            rider: "alice_test",
            driver: "ahmet_drives",
          })
        ).items
      ).toEqual([]);
    });
  });
});

describe.each(subjects({ timeScale: 60 }))(
  "%s rides at scale 60",
  (_name, create) => {
    it("keep a free cancel window of at least 30 s", async () => {
      const { repo, clock } = create();
      await repo.wallet.topUp(topUp(alice));
      const { ride } = await repo.rides.bookRide(rideInput(alice, "economy"));
      expect(
        Date.parse(ride.driverAssignedAt) - Date.parse(ride.requestedAt)
      ).toBe(3 * SECOND);
      expect(Date.parse(ride.pickupAt) - Date.parse(ride.requestedAt)).toBe(
        30 * SECOND
      );
      expect(Date.parse(ride.dropoffAt) - Date.parse(ride.pickupAt)).toBe(
        8 * SECOND
      );

      clock.advance(29 * SECOND);
      expect((await repo.rides.getRide(ride.id))!.canCancel).toBe(true);
      clock.advance(SECOND);
      expect((await repo.rides.getRide(ride.id))!.canCancel).toBe(false);
      await expect(repo.rides.cancelRide({ id: ride.id })).rejects.toThrow(
        InvalidStateError
      );
    });
  }
);

describe("stores agree on rides", () => {
  const reads = (repo: Repository) =>
    Promise.all([
      repo.rides.quote("kizilay", "atakule"),
      repo.rides.quote("esenboga", "odtu"),
      repo.rides.getRide("seed-ride01"),
      repo.rides.listRides({ rider: DEMO_USERNAME }),
      repo.rides.listRides({ driver: "ahmet_drives" }),
      repo.rides.listRides({ rider: "alice_test" }),
      repo.rides.listRides({ rider: "bob_test" }),
      repo.rides.notifications(DEMO_USERNAME, 10),
      repo.rides.notifications("alice_test", 10),
      repo.rides.liveActivity("bob_test"),
      repo.rides.getDriver("canwheels"),
      repo.rides.getDriver("elif_rides"),
      repo.wallet.listActivity("alice_test"),
      repo.wallet.listActivity("elif_rides"),
      repo.wallet.getWallet("ahmet_drives"),
    ]);

  it("for seeded reads", async () => {
    await expectStoresAgree(reads);
  });

  it("after bookings, cancellations, completions and tips", async () => {
    await expectStoresAgree(reads, {
      prepare: async (subject) => {
        const { repo, clock } = subject;
        await repo.wallet.topUp(topUp(alice, "agree-top-up-1"));
        await repo.wallet.topUp(topUp(bob, "agree-top-up-2"));
        const first = await repo.rides.bookRide(
          rideInput(alice, "economy", { key: "agree-1" })
        );
        clock.advance(5 * SECOND);
        await repo.rides.cancelRide({ id: first.ride.id });
        const second = await repo.rides.bookRide(
          rideInput(alice, "economy", { key: "agree-2", to: "esenboga" })
        );
        clock.set(second.ride.dropoffAt);
        const done = (await repo.rides.getRide(second.ride.id))!;
        await repo.wallet.send(
          planRideTip(done, alice, 300, tipKey(alice, done, 300, "agree-tip"))
        );
        await repo.rides.bookRide(
          rideInput(bob, "comfort", { key: "agree-3" })
        );
        clock.advance(MINUTE);
      },
    });
  });
});

describe("memory ride capacity", () => {
  it("refuses new bookings when the store is full, keeping every ride", async () => {
    const state = createMemoryState(createSeedData(SUBJECT_NOW));
    const repo = createMemoryRepository(state, {
      now: () => SUBJECT_NOW,
      limits: { rides: state.rides.rides.size },
    });
    await repo.wallet.topUp(topUp(alice));
    await expect(
      repo.rides.bookRide(rideInput(alice, "economy"))
    ).rejects.toThrow(LimitExceededError);
    expect(state.rides.rides.size).toBe(1);
    expect((await repo.wallet.getWallet("alice_test")).balance).toBe(10_000);
    expect((await repo.wallet.audit()).ok).toBe(true);
  });
});

describe("Sanity rides", () => {
  const sanity = () => subjects()[1][1]();

  it("book and cancel in one transaction each, taking and releasing the driver lock", async () => {
    const subject = sanity();
    const client = subject.client!;
    const { repo } = subject;
    await repo.wallet.topUp(topUp(alice));

    const before = client.mutationLog.length;
    const { ride } = await repo.rides.bookRide(rideInput(alice, "comfort"));
    expect(client.mutationLog.length).toBe(before + 1);
    const lock = () =>
      client.documents.find((d) => d._id === "private.driverlock-canwheels");
    expect(lock()).toMatchObject({
      _type: "driverLock",
      driverKey: "canwheels",
      rideId: ride.id,
      until: ride.dropoffAt,
    });
    expect(
      client.documents.find((d) => d._id === `private.${ride.id}`)
    ).toMatchObject({
      _type: "ride",
      riderKey: "alice_test",
      driverKey: "canwheels",
    });

    subject.clock.advance(5 * SECOND);
    await repo.rides.cancelRide({ id: ride.id });
    expect(client.mutationLog.length).toBe(before + 2);
    expect(lock()!.until).toBe(subject.clock.now().toISOString());
  });

  it("guards an existing lock by its revision", async () => {
    const subject = sanity();
    const client = subject.client!;
    const { repo } = subject;
    await repo.wallet.topUp(topUp(alice));
    // The seed left Ahmet's lock from his last trip; Elif is busy.
    expect(
      client.documents.find((d) => d._id === "private.driverlock-ahmet_drives")
    ).toMatchObject({ rideId: "seed-ride01" });
    setDriverActive(subject, "elif_rides", false);

    const { ride } = await repo.rides.bookRide(rideInput(alice, "economy"));
    expect(ride.driver.username).toBe("ahmet_drives");
    const patch = client.mutationLog
      .at(-1)!
      .flatMap((m) => ("patch" in m ? [m.patch] : []))
      .find((p) => p.id === "private.driverlock-ahmet_drives");
    expect(patch?.ifRevisionID).toEqual(expect.any(String));
  });

  it("answers 409 conflict after three lost races, writing nothing", async () => {
    const subject = sanity();
    const client = subject.client!;
    const { repo } = subject;
    await repo.wallet.topUp(topUp(alice));
    const documents = client.documents.length;

    client.injectConflicts(3);
    await expect(
      repo.rides.bookRide(rideInput(alice, "economy"))
    ).rejects.toThrow(ConflictError);
    expect(client.documents.length).toBe(documents);
    expect((await repo.wallet.getWallet("alice_test")).balance).toBe(10_000);
  });

  it("keeps rides and driver locks from anonymous reads", async () => {
    const { client, repo } = sanity();
    client!.anonymous = true;
    expect(await exposedPrivateDocuments(client!)).toEqual([]);
    expect(await repo.rides.getRide("seed-ride01")).toBeNull();
    // Driver profiles are public.
    expect(await repo.rides.getDriver("ahmet_drives")).not.toBeNull();
  });

  it("ignores drafts of rides and driver profiles", async () => {
    const { client, repo } = sanity();
    const ride = client!.documents.find(
      (d) => d._id === "private.seed-ride01"
    )!;
    client!.documents.push({
      ...ride,
      _id: "drafts.private.seed-ride01",
      fare: 1,
    });
    const profile = client!.documents.find(
      (d) => d._id === "driverProfile-canwheels"
    )!;
    client!.documents.push({
      ...profile,
      _id: "drafts.driverProfile-canwheels",
      rideType: "xl",
    });
    expect((await repo.rides.getRide("seed-ride01"))!.fare).toBe(740);
    expect((await repo.rides.getDriver("canwheels"))!.rideType).toBe("comfort");
    expect(
      (await repo.rides.listRides({ driver: "ahmet_drives" })).items
    ).toHaveLength(1);
  });

  it("is unconfigured without a token", async () => {
    const { createSanityRepository } = await import("./sanity/repository");
    const { client } = sanity();
    const repo = createSanityRepository(client!, { canWrite: false });
    expect(repo.featureStatus("rides")).toBe("unconfigured");
  });
});
