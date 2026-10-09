import { expect } from "vitest";

import {
  createMemoryRepository,
  createMemoryState,
  MemoryState,
} from "../lib/db/memory";
import { createSanityRepository } from "../lib/db/sanity/repository";
import { seedToSanityDocuments } from "../lib/db/sanity/seed";
import { createSeedData, SeedWorld } from "../lib/db/seed";
import { Repository } from "../lib/db/types";
import { FeatureId } from "../types/Superapp";
import { FakeSanityClient } from "./fakeSanityClient";

// The contract harness: every repository test runs against the in-memory
// store and the Sanity repository (real GROQ through the fake client), built
// from the same seed world with the same clock and deterministic ids.

/** The time every subject starts at. */
export const SUBJECT_NOW = new Date("2026-10-08T12:00:00.000Z");

export interface Subject {
  name: "memory" | "sanity";
  repo: Repository;
  clock: { now(): Date; set(iso: string): void; advance(ms: number): void };
  /** Moderates a Tweet the way a Studio editor would (blockTweet = true). */
  block(tweetId: string): void;
  /** Freezes or unfreezes a wallet the way a moderator would (a walletFreeze document). */
  freeze(username: string, frozen: boolean): void;
  /** memory only */
  state?: MemoryState;
  /** sanity only */
  client?: FakeSanityClient;
}

export interface SubjectOptions {
  world?: SeedWorld;
  timeScale?: number;
  disabled?: FeatureId[];
}

function createClock(start: Date): Subject["clock"] {
  let time = start.getTime();
  return {
    now: () => new Date(time),
    set: (iso) => {
      time = Date.parse(iso);
    },
    advance: (ms) => {
      time += ms;
    },
  };
}

function idGenerator() {
  let counter = 0;
  return () => `new-${++counter}`;
}

const noSleep = async () => undefined;

function memorySubject({
  world = "superapp",
  timeScale = 1,
  disabled = [],
}: SubjectOptions): Subject {
  const clock = createClock(SUBJECT_NOW);
  const state = createMemoryState(createSeedData(clock.now(), { world }));
  return {
    name: "memory",
    repo: createMemoryRepository(state, {
      now: clock.now,
      generateId: idGenerator(),
      timeScale,
      disabled: new Set(disabled),
    }),
    clock,
    block: (id) => {
      state.tweets.get(id)!.blocked = true;
    },
    freeze: (username, frozen) => {
      const key = username.toLowerCase();
      if (frozen) state.wallet.frozen.add(key);
      else state.wallet.frozen.delete(key);
    },
    state,
  };
}

function sanitySubject({
  world = "superapp",
  timeScale = 1,
  disabled = [],
}: SubjectOptions): Subject {
  const clock = createClock(SUBJECT_NOW);
  const client = new FakeSanityClient(
    seedToSanityDocuments(createSeedData(clock.now(), { world })),
    clock.now
  );
  return {
    name: "sanity",
    repo: createSanityRepository(client, {
      canWrite: true,
      superappClient: client,
      now: clock.now,
      generateId: idGenerator(),
      sleep: noSleep,
      timeScale,
      disabled: new Set(disabled),
    }),
    clock,
    // Studio edits bypass the app, so they bypass mutationLog too.
    block: (id) => {
      client.documents.find((document) => document._id === id)!.blockTweet =
        true;
    },
    freeze: (username, frozen) => {
      const key = username.toLowerCase();
      client.documents = client.documents.filter(
        (document) =>
          document._type !== "walletFreeze" ||
          String(document.username).toLowerCase() !== key
      );
      if (frozen) {
        const now = clock.now().toISOString();
        client.documents.push({
          _id: `walletFreeze-${key}`,
          _type: "walletFreeze",
          _createdAt: now,
          _updatedAt: now,
          _rev: `freeze-${key}-${now}`,
          username,
          createdAt: now,
        });
      }
    },
    client,
  };
}

/** `describe.each(subjects())`: one memory and one Sanity subject factory. */
export function subjects(opts: SubjectOptions = {}): [string, () => Subject][] {
  return [
    ["memory", () => memorySubject(opts)],
    ["sanity", () => sanitySubject(opts)],
  ];
}

/** Usernames that have a stored wallet. */
function walletOwners(subject: Subject): string[] {
  if (subject.state) return [...subject.state.wallet.balances.keys()];
  return (subject.client?.documents ?? [])
    .filter((document) => document._type === "wallet")
    .map((document) => String(document.username));
}

/**
 * The ledger invariants (§6.2): the store's own audit passes, and every
 * wallet has 0 <= pending <= balance with available = balance - pending.
 * Lanes call it after every money scenario.
 */
export async function expectLedgerInvariants(subject: Subject): Promise<void> {
  const audit = await subject.repo.wallet.audit();
  expect(audit.ok, JSON.stringify(audit)).toBe(true);

  for (const username of walletOwners(subject)) {
    const wallet = await subject.repo.wallet.getWallet(username);
    expect(wallet.pending, username).toBeGreaterThanOrEqual(0);
    expect(wallet.pending, username).toBeLessThanOrEqual(wallet.balance);
    expect(wallet.available, username).toBe(wallet.balance - wallet.pending);
  }
}

/**
 * Runs `read` against a fresh memory and a fresh Sanity subject (after the
 * same `prepare`) and expects identical results.
 */
export async function expectStoresAgree<T>(
  read: (repo: Repository) => Promise<T>,
  opts: SubjectOptions & {
    prepare?: (subject: Subject) => Promise<void> | void;
  } = {}
): Promise<void> {
  const [memory, sanity] = subjects(opts).map(([, create]) => create());
  for (const subject of [memory, sanity]) await opts.prepare?.(subject);

  expect(await read(sanity.repo)).toEqual(await read(memory.repo));
}

/** A seeded PRNG for property tests that must replay identically in both stores. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
