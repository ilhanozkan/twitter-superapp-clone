import { describe, expect, it } from "vitest";

import { firstName, postedAgo, storyPosition } from "./storyText";
import { unseenIds, parseViewerArgs, viewerArgs } from "./viewerArgs";

const NOW = Date.parse("2026-10-14T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("story text", () => {
  it("says how long ago a story was posted, in words", () => {
    expect(postedAgo(ago(20_000), NOW)).toBe("posted just now");
    expect(postedAgo(ago(60_000), NOW)).toBe("posted 1 minute ago");
    expect(postedAgo(ago(59 * 60_000), NOW)).toBe("posted 59 minutes ago");
    expect(postedAgo(ago(60 * 60_000), NOW)).toBe("posted 1 hour ago");
    expect(postedAgo(ago(23.9 * 60 * 60_000), NOW)).toBe("posted 23 hours ago");
    // A clock a little behind the server's never says "in the future".
    expect(postedAgo(ago(-5_000), NOW)).toBe("posted just now");
  });

  it("announces the position", () => {
    expect(storyPosition(1, 3, "Mert Demir", ago(2 * 3_600_000), NOW)).toBe(
      "Story 2 of 3 by Mert Demir, posted 2 hours ago"
    );
  });

  it("uses the first name for the reply placeholder", () => {
    expect(firstName("Mert Demir")).toBe("Mert");
    expect(firstName("  Kızılay Kahve ")).toBe("Kızılay");
    expect(firstName("superapp")).toBe("superapp");
  });
});

describe("viewer arguments", () => {
  it("round-trip through the dialog's string arguments", () => {
    const args = viewerArgs(["foodie_ankara", "lenaframes"], {
      from: "LenaFrames",
      story: "seed-story05",
    });
    expect(args).toEqual({
      authors: "foodie_ankara,lenaframes",
      from: "LenaFrames",
      story: "seed-story05",
    });
    expect(parseViewerArgs(args)).toEqual({
      authors: ["foodie_ankara", "lenaframes"],
      start: 1,
      story: "seed-story05",
    });
    expect(parseViewerArgs({ authors: "a", from: "zz" })).toEqual({
      authors: ["a"],
      start: 0,
      story: null,
    });
    expect(parseViewerArgs(null)).toBeNull();
    expect(parseViewerArgs({ authors: "" })).toBeNull();
  });

  it("count unseen stories from the server's first unseen, minus those watched here", () => {
    const item = {
      author: { username: "a", fullname: "A", image: null },
      storyIds: ["s1", "s2", "s3"],
      latestAt: ago(0),
      hasUnseen: true,
      firstUnseenId: "s2",
    };
    expect(unseenIds(item, {})).toEqual(["s2", "s3"]);
    expect(unseenIds(item, { s3: true })).toEqual(["s2"]);
    expect(
      unseenIds({ ...item, hasUnseen: false, firstUnseenId: null }, {})
    ).toEqual([]);
  });
});
