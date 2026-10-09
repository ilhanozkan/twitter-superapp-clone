import { describe, expect, it, vi } from "vitest";

import { FakeSanityClient } from "../../../test/fakeSanityClient";
import { createRead } from "./deps";
import { assertPublishedFilter, PUBLISHED } from "./groq";

const T0 = "2026-10-08T12:00:00.000Z";
const wallet = (_id: string) => ({
  _id,
  _type: "wallet",
  _createdAt: T0,
  username: "a",
});

describe("PUBLISHED", () => {
  it("keeps published and private documents and drops drafts and versions", async () => {
    const client = new FakeSanityClient([
      wallet("private.wallet-a"),
      wallet("drafts.private.wallet-a"),
      wallet("versions.r1.private.wallet-a"),
      wallet("wallet-legacy"),
    ]);

    expect(
      await client.fetch(`*[_type == "wallet" && ${PUBLISHED}]._id`)
    ).toEqual(["private.wallet-a", "wallet-legacy"]);
    expect(
      await client.fetch(
        `*[_type == "wallet" && _id in path("private.**") && ${PUBLISHED}]._id`
      )
    ).toEqual(["private.wallet-a"]);
  });

  it("is required on every SuperApp read under test", async () => {
    const fetch = vi.fn(async () => []);
    const read = createRead({ fetch } as never);

    await expect(read(`*[_type == "wallet"]`)).rejects.toThrow(
      /without the PUBLISHED filter/
    );
    expect(() => assertPublishedFilter(`*[_type == "x"]`)).toThrow();

    await read(`*[_type == "wallet" && ${PUBLISHED}]`, { a: 1 });
    expect(fetch).toHaveBeenCalledWith(`*[_type == "wallet" && ${PUBLISHED}]`, {
      a: 1,
    });
  });
});
