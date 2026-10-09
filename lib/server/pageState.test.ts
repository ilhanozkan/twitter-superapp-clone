import type { GetServerSidePropsContext } from "next";
import { afterEach, describe, expect, it, vi } from "vitest";

import { freshApi } from "../../test/api";

const ctx = {} as GetServerSidePropsContext;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("withPageState", () => {
  it("hands every page the SuperApp shell", async () => {
    await freshApi({ world: "superapp" });
    const { withPageState } = await import("./pageState");
    const { getRepository } = await import("../db");

    const result = await withPageState()(ctx);
    if (!("props" in result)) throw new Error("expected props");
    const state = await result.props;
    const { session, wallet, activity } = state.initialState;

    expect(session?.features.wallet).toBe(true);
    expect(session?.managedBusinesses).toContain("superapp");
    expect(wallet?.loaded).toBe(true);
    expect(wallet?.wallet).toEqual(
      await getRepository().wallet.getWallet("illlhanozkan")
    );
    // The bell is recounted on the client with this device's "seen" time.
    expect(activity?.loaded).toBe(false);
  });

  it("is a 404 for a page whose feature is off", async () => {
    await freshApi({ world: "superapp" });
    vi.stubEnv("DISABLED_FEATURES", "wallet");
    const { withPageState } = await import("./pageState");
    const load = vi.fn(async () => ({}));

    expect(await withPageState(load, { feature: "wallet" })(ctx)).toEqual({
      notFound: true,
    });
    expect(load).not.toHaveBeenCalled();
  });

  it("serves a page whose feature is on", async () => {
    await freshApi({ world: "superapp" });
    const { withPageState } = await import("./pageState");
    const result = await withPageState(async () => ({ props: { ok: true } }), {
      feature: "wallet",
    })(ctx);
    expect(result).toMatchObject({ props: { ok: true } });
  });
});
