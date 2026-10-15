import type { GetServerSidePropsContext } from "next";
import { describe, expect, it, vi } from "vitest";

import { freshApi } from "../../test/api";

const ctx = (username: string) =>
  ({ params: { username } }) as unknown as GetServerSidePropsContext;

describe("loadProfile", () => {
  it("adds the business behind a business account", async () => {
    await freshApi({ world: "superapp" });
    const { loadProfile } = await import("./profile");
    const result = await loadProfile("tweets")(ctx("kizilaykahve"));
    if (!("props" in result)) throw new Error("expected props");
    const { user, business } = await result.props;
    expect(user.accountType).toBe("business");
    expect(business).toMatchObject({
      username: "kizilaykahve",
      fullname: "Kızılay Kahve",
      category: "cafe",
      placeId: "kizilay",
    });
  });

  it("has no business for people", async () => {
    await freshApi({ world: "superapp" });
    const { loadProfile } = await import("./profile");
    const result = await loadProfile("likes")(ctx("sarahcodes"));
    if (!("props" in result)) throw new Error("expected props");
    expect((await result.props).business).toBeNull();
  });

  it("still shows the profile when the business can't be read", async () => {
    await freshApi({ world: "superapp" });
    const { loadProfile } = await import("./profile");
    const { getRepository } = await import("../db");
    vi.spyOn(getRepository().business, "getBusiness").mockRejectedValue(
      new Error("down")
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await loadProfile("tweets")(ctx("kizilaykahve"));
    if (!("props" in result)) throw new Error("expected props");
    expect((await result.props).business).toBeNull();
    expect(log).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("finds a profile for any tab, with 404s and canonical redirects", async () => {
    await freshApi({ world: "superapp" });
    const { findProfile } = await import("./profile");
    const { getRepository } = await import("../db");
    const repo = getRepository();

    expect(await findProfile(repo, "KizilayKahve", "/menu")).toEqual({
      redirect: { destination: "/kizilaykahve/menu", permanent: false },
    });
    expect(await findProfile(repo, "ghost_user")).toEqual({ notFound: true });
    expect(await findProfile(repo, "not valid")).toEqual({ notFound: true });
    expect(await findProfile(repo, ["a"])).toEqual({ notFound: true });

    const found = await findProfile(repo, "kizilaykahve", "/menu");
    expect("found" in found && found.found.business?.category).toBe("cafe");
  });
});
