import { describe, expect, it } from "vitest";

import { formatCount, formatRelativeTime, pluralize } from "./format";

const NOW = Date.parse("2026-10-08T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("formatRelativeTime", () => {
  it.each([
    [2_000, "now"],
    [42_000, "42s"],
    [5 * 60_000, "5m"],
    [3 * 3_600_000, "3h"],
    [23 * 3_600_000 + 59 * 60_000, "23h"],
  ])("%sms ago -> %s", (ms, expected) => {
    expect(formatRelativeTime(ago(ms), NOW)).toBe(expected);
  });

  it("shows dates after a day, with the year only for other years", () => {
    expect(formatRelativeTime("2026-10-03T12:00:00Z", NOW)).toBe("Oct 3");
    expect(formatRelativeTime("2024-10-03T12:00:00Z", NOW)).toBe("Oct 3, 2024");
  });
});

describe("formatCount", () => {
  it("abbreviates large numbers", () => {
    expect(formatCount(7)).toBe("7");
    expect(formatCount(1_234)).toBe("1.2K");
    expect(formatCount(2_600_000)).toBe("2.6M");
  });
});

describe("pluralize", () => {
  it("handles one and many", () => {
    expect(pluralize(1, "Tweet")).toBe("1 Tweet");
    expect(pluralize(1204, "Tweet")).toBe("1,204 Tweets");
  });
});
