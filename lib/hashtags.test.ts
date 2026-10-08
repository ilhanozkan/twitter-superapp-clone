import { describe, expect, it } from "vitest";

import { computeTrends, extractHashtags } from "./hashtags";

describe("extractHashtags", () => {
  it("finds hashtags at word boundaries, including non-Latin ones", () => {
    expect(
      extractHashtags("#NextJS and #React, (#TypeScript) #İstanbul")
    ).toEqual(["NextJS", "React", "TypeScript", "İstanbul"]);
  });

  it("ignores mid-word, numeric, URL-fragment and HTML-entity hashes", () => {
    expect(extractHashtags("a#b #1 #2024 https://x.com/#top &#123;")).toEqual(
      []
    );
  });

  it("deduplicates case-insensitively, keeping the first spelling", () => {
    expect(extractHashtags("#react #React #REACT")).toEqual(["react"]);
  });
});

describe("computeTrends", () => {
  it("ranks by number of tweets, then by most recent use", () => {
    const texts = ["#b #c", "#a", "#a #b", "#A"];
    expect(computeTrends(texts, 10)).toEqual([
      { tag: "#a", tweetCount: 3 },
      { tag: "#b", tweetCount: 2 },
      { tag: "#c", tweetCount: 1 },
    ]);
  });

  it("counts a tag once per tweet and honours the limit", () => {
    expect(computeTrends(["#x #x #y"], 1)).toEqual([
      { tag: "#x", tweetCount: 1 },
    ]);
    expect(computeTrends(["#x"], 0)).toEqual([]);
  });
});
