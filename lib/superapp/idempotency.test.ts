import { describe, expect, it } from "vitest";

import { KEY_PATTERN } from "../db/sanity/ids";
import {
  fingerprint,
  IDEMPOTENCY_KEY_PATTERN,
  operationId,
} from "./idempotency";

describe("IDEMPOTENCY_KEY_PATTERN", () => {
  it("accepts 8 to 64 URL-safe characters", () => {
    for (const key of [
      "abcdefgh",
      "A1_b2-C3",
      crypto.randomUUID(),
      "x".repeat(64),
    ]) {
      expect(IDEMPOTENCY_KEY_PATTERN.test(key), key).toBe(true);
    }
  });

  it("rejects short, long, dotted, spaced and empty keys", () => {
    for (const key of [
      "",
      "abcdefg",
      "x".repeat(65),
      "abc.defgh",
      "abc defgh",
      "abcdefgh\n",
      "ключключключ",
    ]) {
      expect(IDEMPOTENCY_KEY_PATTERN.test(key), key).toBe(false);
    }
  });
});

describe("operationId", () => {
  const key = "key-0001";

  it("is the prefix plus 32 hex characters, a valid dot-free document key", () => {
    const id = operationId("tx", "sarahcodes", "wallet.send", key);
    expect(id).toMatch(/^tx-[0-9a-f]{32}$/);
    expect(KEY_PATTERN.test(id)).toBe(true);
    for (const prefix of ["req", "order", "ride", "msg"] as const) {
      expect(operationId(prefix, "a", "wallet.send", key)).toMatch(
        new RegExp(`^${prefix}-[0-9a-f]{32}$`)
      );
    }
  });

  it("is deterministic and ignores the actor's case", () => {
    expect(operationId("tx", "SarahCodes", "wallet.send", key)).toBe(
      operationId("tx", "sarahcodes", "wallet.send", key)
    );
  });

  it("separates actors, scopes and keys", () => {
    const ids = new Set([
      operationId("tx", "sarahcodes", "wallet.send", key),
      operationId("tx", "devmarco", "wallet.send", key),
      operationId("tx", "sarahcodes", "tweets.tip", key),
      operationId("tx", "sarahcodes", "wallet.send", "key-0002"),
    ]);
    expect(ids.size).toBe(4);
  });
});

describe("fingerprint", () => {
  it("is a sha256 hex digest, stable across key order", () => {
    const a = fingerprint({ to: "sarahcodes", amount: 500, note: null });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint({ note: null, amount: 500, to: "sarahcodes" })).toBe(a);
    expect(fingerprint({ body: { b: 1, a: [{ y: 2, x: 1 }] }, id: "t1" })).toBe(
      fingerprint({ id: "t1", body: { a: [{ x: 1, y: 2 }], b: 1 } })
    );
  });

  it("drops undefined fields but keeps nulls, and keeps array order", () => {
    expect(fingerprint({ amount: 500, note: undefined })).toBe(
      fingerprint({ amount: 500 })
    );
    expect(fingerprint({ amount: 500, note: null })).not.toBe(
      fingerprint({ amount: 500 })
    );
    expect(fingerprint([1, 2])).not.toBe(fingerprint([2, 1]));
  });

  it("changes with any value", () => {
    const base = { to: "sarahcodes", amount: 500 };
    expect(fingerprint({ ...base, amount: 501 })).not.toBe(fingerprint(base));
    expect(fingerprint({ ...base, to: "SarahCodes" })).not.toBe(
      fingerprint(base)
    );
    expect(fingerprint("500")).not.toBe(fingerprint(500));
  });
});
