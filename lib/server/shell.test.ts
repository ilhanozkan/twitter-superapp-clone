import { afterEach, describe, expect, it, vi } from "vitest";

import { IFeatures } from "../../types/Superapp";
import { IWallet } from "../../types/Wallet";
import type { Repository } from "../db";
import { NO_FEATURES } from "../superapp/features";
import { loadShellState } from "./shell";

const now = new Date("2026-10-09T12:00:00.000Z");
const wallet: IWallet = {
  username: "me",
  balance: 1_000,
  pending: 0,
  available: 1_000,
  frozen: false,
};
const on = (...ids: (keyof IFeatures)[]): IFeatures => ({
  ...NO_FEATURES,
  ...Object.fromEntries(ids.map((id) => [id, true])),
});

/** Just enough of a repository for the shell. */
function fakeRepo(overrides: Record<string, unknown> = {}): Repository {
  return {
    features: on("wallet"),
    wallet: {
      getWallet: async () => wallet,
      getLimits: async () => ({ topUpsLeftToday: 3 }),
      liveActivity: async () => [],
    },
    business: { listManagedBusinesses: async () => ["superapp"] },
    messages: { unreadConversations: async () => 2 },
    listNotifications: async () => [],
    ...overrides,
  } as unknown as Repository;
}

const fail = async () => {
  throw new Error("read failed");
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadShellState", () => {
  it("loads features, managed businesses, the wallet and activity", async () => {
    const shell = await loadShellState(fakeRepo(), "me", now);
    expect(shell).toEqual({
      features: on("wallet"),
      managedBusinesses: ["superapp"],
      wallet: {
        wallet,
        limits: { topUpsLeftToday: 3 },
        serverNow: now.toISOString(),
      },
      activity: {
        serverNow: now.toISOString(),
        unreadConversations: 0,
        newNotifications: 0,
        live: [],
      },
    });
  });

  it("reads no wallet while the wallet is off", async () => {
    const getWallet = vi.fn(fail);
    const shell = await loadShellState(
      fakeRepo({ features: NO_FEATURES, wallet: { getWallet } }),
      "me",
      now
    );
    expect(shell.wallet).toBeNull();
    expect(getWallet).not.toHaveBeenCalled();
  });

  it("degrades each failing part on its own, never the page", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const shell = await loadShellState(
      fakeRepo({
        wallet: { getWallet: fail, getLimits: fail, liveActivity: fail },
        business: { listManagedBusinesses: fail },
        listNotifications: fail,
      }),
      "me",
      now
    );

    expect(shell).toEqual({
      features: on("wallet"),
      managedBusinesses: [],
      wallet: null,
      activity: {
        serverNow: now.toISOString(),
        unreadConversations: 0,
        newNotifications: 0,
        live: [],
      },
    });
    const logged = log.mock.calls.map(([line]) => JSON.parse(line).message);
    for (const part of ["wallet", "managed businesses", "activity"]) {
      expect(logged).toContain(`Loading the ${part} for the page shell failed`);
    }
  });
});
