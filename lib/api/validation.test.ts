import { describe, expect, it } from "vitest";

import {
  createTweetBody,
  isSafeImageUrl,
  listTweetsQuery,
  tweetText,
} from "./validation";

describe("tweetText", () => {
  it("normalizes line endings, strips control characters and trims", () => {
    expect(tweetText.parse("  a\r\nb\rc\u0000\u001b[31m\t ")).toBe(
      "a\nb\nc[31m"
    );
  });

  it("normalizes to NFC before counting", () => {
    const decomposed = "e\u0301".repeat(280); // "é" as two code points each
    expect(tweetText.safeParse(decomposed).success).toBe(true);
  });

  it("rejects empty and overlong text", () => {
    expect(tweetText.safeParse(" \n ").success).toBe(false);
    expect(tweetText.safeParse("a".repeat(281)).success).toBe(false);
    expect(tweetText.safeParse(null).success).toBe(false);
  });
});

describe("isSafeImageUrl", () => {
  it.each([
    ["https://cdn.sanity.io/images/a.png", true],
    ["/media/coffee.svg", true],
    ["http://example.com/a.png", false],
    ["//evil.example/a.png", false],
    ["/\\evil.example", false],
    ["javascript:alert(1)", false],
    ["data:image/svg+xml,<svg/>", false],
    ["not a url", false],
  ])("%s -> %s", (value, expected) => {
    expect(isSafeImageUrl(value)).toBe(expected);
  });
});

describe("createTweetBody", () => {
  it("allows a missing or null image and drops unknown fields", () => {
    expect(createTweetBody.parse({ text: "hi", username: "mallory" })).toEqual({
      text: "hi",
    });
    expect(createTweetBody.parse({ text: "hi", image: null })).toEqual({
      text: "hi",
      image: null,
    });
  });
});

describe("listTweetsQuery", () => {
  it("coerces the limit and validates cursors", () => {
    expect(listTweetsQuery.parse({ limit: "10" })).toEqual({ limit: 10 });
    expect(listTweetsQuery.safeParse({ limit: "1.5" }).success).toBe(false);
    expect(listTweetsQuery.safeParse({ cursor: "abc" }).success).toBe(false);
    expect(listTweetsQuery.safeParse({ bookmarked: "yes" }).success).toBe(
      false
    );
  });
});
