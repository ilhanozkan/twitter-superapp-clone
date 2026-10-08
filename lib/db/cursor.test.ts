import { describe, expect, it } from "vitest";

import {
  clampLimit,
  compareNewestFirst,
  decodeCursor,
  encodeCursor,
  isAfterCursor,
} from "./cursor";

describe("cursor", () => {
  it("round-trips", () => {
    const cursor = { createdAt: "2026-10-08T12:00:00.000Z", id: "abc-123|x" };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("rejects values it did not produce", () => {
    for (const value of [
      undefined,
      null,
      "",
      "garbage",
      encodeCursor({ createdAt: "yesterday", id: "a" }),
    ]) {
      expect(decodeCursor(value)).toBeNull();
    }
    expect(decodeCursor(Buffer.from("|id").toString("base64url"))).toBeNull();
    expect(
      decodeCursor(Buffer.from("2026-10-08T12:00:00Z|").toString("base64url"))
    ).toBeNull();
  });

  it("orders newest first with the id as tie-breaker", () => {
    const a = { createdAt: "2026-10-08T12:00:00.000Z", id: "a" };
    const b = { createdAt: "2026-10-08T12:00:00.000Z", id: "b" };
    const older = { createdAt: "2026-10-07T12:00:00.000Z", id: "z" };

    expect([older, a, b].sort(compareNewestFirst)).toEqual([b, a, older]);
    expect(isAfterCursor(a, b)).toBe(true);
    expect(isAfterCursor(b, a)).toBe(false);
    expect(isAfterCursor(a, a)).toBe(false);
  });

  it("clamps page sizes", () => {
    expect(clampLimit(undefined)).toBe(20);
    expect(clampLimit(Number.NaN)).toBe(20);
    expect(clampLimit(-5)).toBe(1);
    expect(clampLimit(500)).toBe(50);
    expect(clampLimit(7.9)).toBe(7);
  });
});
