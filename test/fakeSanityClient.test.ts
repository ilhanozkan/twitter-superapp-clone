import { describe, expect, it } from "vitest";

import { SanityMutation } from "../lib/db/sanity/ledger";
import { FakeClientError, FakeSanityClient } from "./fakeSanityClient";

const T0 = "2026-10-08T12:00:00.000Z";

function setup() {
  let time = Date.parse(T0);
  const client = new FakeSanityClient(
    [
      { _id: "user-a", _type: "user", _createdAt: T0, username: "a" },
      {
        _id: "private.wallet-a",
        _type: "wallet",
        _createdAt: T0,
        username: "a",
        balance: 1000,
        meta: { count: 1, tags: ["x"] },
      },
    ],
    () => new Date(time)
  );
  return {
    client,
    tick: (ms = 1000) => {
      time += ms;
    },
  };
}

const doc = (client: FakeSanityClient, id: string) =>
  client.documents.find((document) => document._id === id);

/** The rejection of `promise`, which must reject. */
async function failure(promise: Promise<unknown>): Promise<FakeClientError> {
  try {
    await promise;
  } catch (error) {
    return error as FakeClientError;
  }
  throw new Error("Expected the promise to reject");
}

function expectClientError(
  error: FakeClientError,
  statusCode: number,
  type: string,
  id: string
) {
  expect(error).toBeInstanceOf(FakeClientError);
  expect(error.statusCode).toBe(statusCode);
  expect(error.response.body.error.type).toBe("mutationError");
  expect(error.response.body.error.items[0].error).toMatchObject({ type, id });
}

describe("FakeSanityClient", () => {
  describe("reads", () => {
    it("runs GROQ with params and returns copies", async () => {
      const { client } = setup();
      const wallet = await client.fetch<{ balance: number; meta: object }>(
        `*[_type == $type][0]`,
        { type: "wallet" }
      );
      expect(wallet.balance).toBe(1000);

      wallet.balance = 0;
      expect(doc(client, "private.wallet-a")!.balance).toBe(1000);
    });

    it("gives loaded documents seed revisions", () => {
      const { client } = setup();
      expect(client.documents.map((document) => document._rev)).toEqual([
        "seed-rev-1",
        "seed-rev-2",
      ]);
      expect(doc(client, "user-a")!._updatedAt).toBe(T0);
    });

    it("hides path documents from anonymous reads", async () => {
      const { client } = setup();
      client.anonymous = true;

      expect(await client.fetch(`*[]._id`)).toEqual(["user-a"]);
      expect(await client.fetch(`*[_id in path("private.**")]._id`)).toEqual(
        []
      );
      expect(await client.getDocument("private.wallet-a")).toBeUndefined();

      client.anonymous = false;
      expect(await client.getDocument("private.wallet-a")).toMatchObject({
        balance: 1000,
      });
    });
  });

  describe("create", () => {
    it("honours _id, generates one otherwise, and stamps the clock", async () => {
      const { client, tick } = setup();
      tick(5000);

      const named = await client.create({ _id: "t1", _type: "tweet" });
      const generated = await client.create({ _type: "tweet" });

      expect(named).toMatchObject({
        _id: "t1",
        _createdAt: "2026-10-08T12:00:05.000Z",
        _updatedAt: "2026-10-08T12:00:05.000Z",
      });
      expect(generated._id).toBe("fake-1");
      expect(named._rev).not.toBe(generated._rev);
    });

    it("refuses an existing id with 409", async () => {
      const { client } = setup();
      const error = await failure(
        client.mutate([{ create: { _id: "user-a", _type: "user" } }])
      );
      expectClientError(error, 409, "documentAlreadyExistsError", "user-a");
    });

    it("createIfNotExists creates once and then leaves the document alone", async () => {
      const { client } = setup();
      await client.createIfNotExists({ _id: "w", _type: "wallet", balance: 0 });
      const rev = doc(client, "w")!._rev;

      const existing = await client.createIfNotExists({
        _id: "w",
        _type: "wallet",
        balance: 99,
      });
      expect(existing).toMatchObject({ balance: 0, _rev: rev });
    });

    it("createOrReplace replaces the content but keeps _createdAt", async () => {
      const { client, tick } = setup();
      tick();
      await client.mutate([
        { createOrReplace: { _id: "user-a", _type: "user", username: "b" } },
      ]);

      const replaced = doc(client, "user-a")!;
      expect(replaced.username).toBe("b");
      expect(replaced._createdAt).toBe(T0);
      expect(replaced._updatedAt).toBe("2026-10-08T12:00:01.000Z");
      expect(replaced._rev).not.toBe("seed-rev-1");
    });
  });

  describe("delete", () => {
    it("removes documents and ignores missing ids", async () => {
      const { client } = setup();
      await client.delete("user-a");
      await client.mutate([{ delete: { id: "nope" } }]);
      expect(client.documents.map((document) => document._id)).toEqual([
        "private.wallet-a",
      ]);
    });
  });

  describe("patch", () => {
    it("sets, sets if missing and unsets keys and dotted paths", async () => {
      const { client } = setup();
      await client.mutate([
        {
          patch: {
            id: "private.wallet-a",
            set: { updatedAt: "now", "meta.count": 2, "fresh.deep": true },
            setIfMissing: { balance: 5, note: "hi", "meta.extra": 1 },
            unset: ["username", "meta.tags", "missing.path"],
          },
        },
      ]);

      const wallet = doc(client, "private.wallet-a")!;
      expect(wallet).toMatchObject({
        balance: 1000,
        note: "hi",
        updatedAt: "now",
        meta: { count: 2, extra: 1 },
        fresh: { deep: true },
      });
      expect(wallet.username).toBeUndefined();
      expect(wallet.meta).not.toHaveProperty("tags");
    });

    it("increments and decrements numbers", async () => {
      const { client } = setup();
      await client.mutate([
        {
          patch: {
            id: "private.wallet-a",
            inc: { balance: 250, "meta.count": 1 },
          },
        },
        { patch: { id: "private.wallet-a", dec: { balance: 50 } } },
      ]);
      expect(doc(client, "private.wallet-a")).toMatchObject({
        balance: 1200,
        meta: { count: 2 },
      });
    });

    it("refuses inc and dec on a missing or non-numeric field", async () => {
      const { client } = setup();
      const patches: SanityMutation[] = [
        { patch: { id: "private.wallet-a", inc: { missing: 1 } } },
        { patch: { id: "private.wallet-a", dec: { "meta.nope": 1 } } },
        { patch: { id: "private.wallet-a", inc: { username: 1 } } },
      ];
      for (const patch of patches) {
        const error = await failure(client.mutate([patch]));
        expectClientError(error, 400, "invalidPatchError", "private.wallet-a");
      }
      expect(doc(client, "private.wallet-a")!._rev).toBe("seed-rev-2");
    });

    it("guards on the revision", async () => {
      const { client } = setup();
      await client.mutate([
        {
          patch: {
            id: "private.wallet-a",
            ifRevisionID: "seed-rev-2",
            set: { balance: 900 },
          },
        },
      ]);
      const rev = doc(client, "private.wallet-a")!._rev;
      expect(rev).not.toBe("seed-rev-2");

      const error = await failure(
        client.mutate([
          {
            patch: {
              id: "private.wallet-a",
              ifRevisionID: "seed-rev-2",
              set: { balance: 0 },
            },
          },
        ])
      );
      expectClientError(
        error,
        409,
        "documentRevisionMismatchError",
        "private.wallet-a"
      );
      expect(doc(client, "private.wallet-a")).toMatchObject({
        balance: 900,
        _rev: rev,
      });
    });

    it("answers 404 for a missing document", async () => {
      const { client } = setup();
      const error = await failure(
        client.mutate([{ patch: { id: "ghost", set: { a: 1 } } }])
      );
      expectClientError(error, 404, "documentNotFoundError", "ghost");
    });
  });

  describe("transactions", () => {
    it("bumps _rev and _updatedAt on every write", async () => {
      const { client, tick } = setup();
      const revs = new Set<string>();
      for (let i = 0; i < 3; i++) {
        tick();
        await client.mutate([{ patch: { id: "user-a", set: { n: i } } }]);
        revs.add(doc(client, "user-a")!._rev);
      }
      expect(revs.size).toBe(3);
      expect(doc(client, "user-a")!._updatedAt).toBe(
        "2026-10-08T12:00:03.000Z"
      );
    });

    it("commits all or nothing", async () => {
      const { client } = setup();
      const before = structuredClone(client.documents);

      const error = await failure(
        client.mutate([
          { create: { _id: "t1", _type: "tweet" } },
          { patch: { id: "private.wallet-a", inc: { balance: -100 } } },
          { delete: { id: "user-a" } },
          { patch: { id: "ghost", set: { a: 1 } } },
        ])
      );

      expect(error.statusCode).toBe(404);
      expect(client.documents).toEqual(before);
      expect(client.mutationLog).toEqual([]);
    });

    it("applies mutations in order within a transaction", async () => {
      const { client } = setup();
      await client.mutate([
        { createIfNotExists: { _id: "w", _type: "wallet", balance: 0 } },
        { patch: { id: "w", inc: { balance: 300 } } },
        { patch: { id: "w", set: { updatedAt: "t" } } },
      ]);
      expect(doc(client, "w")).toMatchObject({ balance: 300, updatedAt: "t" });
    });

    it("checks strong references on the staged result", async () => {
      const { client } = setup();
      const ref = (id: string, weak = false) => ({
        _type: "reference",
        _ref: id,
        ...(weak ? { _weak: true } : {}),
      });

      // A reference to a document created later in the same transaction.
      await client.mutate([
        { create: { _id: "r1", _type: "comment", tweet: ref("t1") } },
        { create: { _id: "t1", _type: "tweet" } },
      ]);

      const missing = await failure(
        client.mutate([
          { create: { _id: "r2", _type: "comment", tweet: ref("ghost") } },
        ])
      );
      expectClientError(missing, 409, "documentReferenceMissingError", "r2");

      const referenced = await failure(client.delete("t1"));
      expectClientError(
        referenced,
        409,
        "documentHasExistingReferencesError",
        "t1"
      );

      // Weak references never block; deleting both sides together is fine.
      await client.create({
        _id: "like",
        _type: "like",
        tweet: ref("t1", true),
      });
      await client.mutate([{ delete: { id: "r1" } }, { delete: { id: "t1" } }]);
      expect(doc(client, "t1")).toBeUndefined();
    });

    it("routes the helpers through mutate and logs committed transactions", async () => {
      const { client } = setup();
      await client.create({ _id: "t1", _type: "tweet" });
      await client.createIfNotExists({ _id: "t2", _type: "tweet" });
      await client.delete("t1");
      await failure(client.mutate([{ patch: { id: "ghost", set: {} } }]));

      expect(client.mutationLog).toEqual([
        [{ create: { _id: "t1", _type: "tweet" } }],
        [{ createIfNotExists: { _id: "t2", _type: "tweet" } }],
        [{ delete: { id: "t1" } }],
      ]);
    });
  });

  describe("test hooks", () => {
    it("beforeMutate runs a competing write between a read and a commit", async () => {
      const { client } = setup();
      const { _rev } = (await client.getDocument("private.wallet-a"))!;

      client.beforeMutate = async () => {
        client.beforeMutate = undefined;
        await client.mutate([
          { patch: { id: "private.wallet-a", dec: { balance: 600 } } },
        ]);
      };

      const error = await failure(
        client.mutate([
          {
            patch: {
              id: "private.wallet-a",
              ifRevisionID: _rev,
              dec: { balance: 600 },
            },
          },
        ])
      );
      expect(error.statusCode).toBe(409);
      expect(doc(client, "private.wallet-a")!.balance).toBe(400);
      expect(client.mutationLog).toHaveLength(1);
    });

    it("skips the hooks for writes made inside beforeMutate", async () => {
      const { client } = setup();
      let calls = 0;
      client.beforeMutate = async () => {
        calls += 1;
        await client.create({ _type: "tweet" });
      };

      await client.create({ _id: "t1", _type: "tweet" });
      await client.create({ _id: "t2", _type: "tweet" });
      expect(calls).toBe(2);
      expect(client.mutationLog).toHaveLength(4);
    });

    it("fetchDelay lets concurrent operations all read before any commits", async () => {
      const { client } = setup();
      client.fetchDelay = () => new Promise((resolve) => setImmediate(resolve));

      const withdraw = async () => {
        const wallet = await client.fetch<{ _rev: string; balance: number }>(
          `*[_id == "private.wallet-a"][0]{ _rev, balance }`
        );
        await client.mutate([
          {
            patch: {
              id: "private.wallet-a",
              ifRevisionID: wallet._rev,
              set: { balance: wallet.balance - 300 },
            },
          },
        ]);
      };

      const results = await Promise.allSettled([
        withdraw(),
        withdraw(),
        withdraw(),
      ]);
      expect(results.map((result) => result.status)).toEqual([
        "fulfilled",
        "rejected",
        "rejected",
      ]);
      expect(doc(client, "private.wallet-a")!.balance).toBe(700);
    });

    it("failNextMutate fails exactly the next transaction", async () => {
      const { client } = setup();
      const boom = new Error("network down");
      client.failNextMutate(boom);

      expect(await failure(client.create({ _id: "t1", _type: "tweet" }))).toBe(
        boom
      );
      await client.create({ _id: "t1", _type: "tweet" });
      expect(client.mutationLog).toHaveLength(1);
    });

    it("injectConflicts fails the next n transactions with 409", async () => {
      const { client } = setup();
      client.injectConflicts(2);

      for (let i = 0; i < 2; i++) {
        const error = await failure(
          client.mutate([{ patch: { id: "user-a", set: { n: i } } }])
        );
        expectClientError(
          error,
          409,
          "documentRevisionMismatchError",
          "injected"
        );
      }
      await client.mutate([{ patch: { id: "user-a", set: { n: 2 } } }]);
      expect(doc(client, "user-a")!.n).toBe(2);
      expect(client.mutationLog).toHaveLength(1);
    });
  });
});
