import { describe, expect, it } from "vitest";

import { KEY_PATTERN, keyOf, privateId, walletKey } from "./ids";

describe("private ids", () => {
  it("prefixes dot-free keys and strips the prefix again", () => {
    expect(privateId("tx-abc_1")).toBe("private.tx-abc_1");
    expect(keyOf("private.tx-abc_1")).toBe("tx-abc_1");
    expect(keyOf("seed-t01")).toBe("seed-t01");
  });

  it("refuses keys that could escape the private path", () => {
    for (const key of ["", "a.b", "drafts.x", "a/b", "x".repeat(121)]) {
      expect(() => privateId(key), key).toThrow(/Invalid document key/);
      expect(KEY_PATTERN.test(key)).toBe(false);
    }
  });

  it("has one wallet key per username, in any case", () => {
    expect(walletKey("SarahCodes")).toBe("wallet-sarahcodes");
    expect(privateId(walletKey("sarahcodes"))).toBe(
      "private.wallet-sarahcodes"
    );
  });
});
