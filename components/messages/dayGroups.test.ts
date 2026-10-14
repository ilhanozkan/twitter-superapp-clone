import { describe, expect, it } from "vitest";

import { dayLabel, groupByDay } from "./dayGroups";

const now = Date.parse("2026-10-09T12:00:00.000Z");

describe("day separators", () => {
  it("labels today, yesterday, then dates (with the year when it differs)", () => {
    expect(dayLabel("2026-10-09T00:30:00.000Z", now, "UTC")).toBe("Today");
    expect(dayLabel("2026-10-08T23:59:00.000Z", now, "UTC")).toBe("Yesterday");
    expect(dayLabel("2026-10-06T10:00:00.000Z", now, "UTC")).toBe("Oct 6");
    expect(dayLabel("2025-12-31T10:00:00.000Z", now, "UTC")).toBe(
      "Dec 31, 2025"
    );
  });

  it("follows the reader's time zone", () => {
    // 23:30 UTC on Oct 8 is already Oct 9 in Istanbul (UTC+3).
    expect(dayLabel("2026-10-08T23:30:00.000Z", now, "Europe/Istanbul")).toBe(
      "Today"
    );
  });

  it("groups consecutive items of a day, in order", () => {
    const items = [
      { id: "a", createdAt: "2026-10-08T10:00:00.000Z" },
      { id: "b", createdAt: "2026-10-09T09:00:00.000Z" },
      { id: "c", createdAt: "2026-10-09T10:00:00.000Z" },
    ];
    expect(
      groupByDay(items, now, "UTC").map((group) => [
        group.label,
        group.items.map((item) => item.id),
      ])
    ).toEqual([
      ["Yesterday", ["a"]],
      ["Today", ["b", "c"]],
    ]);
  });
});
