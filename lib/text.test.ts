import { describe, expect, it } from "vitest";

import { displayUrl, safeHref, tokenizeTweet } from "./text";

describe("tokenizeTweet", () => {
  it("finds hashtags, mentions and links", () => {
    expect(
      tokenizeTweet("Hi @sarahcodes, see https://example.com/a. #React!")
    ).toEqual([
      { type: "text", value: "Hi " },
      { type: "mention", value: "@sarahcodes", username: "sarahcodes" },
      { type: "text", value: ", see " },
      {
        type: "url",
        value: "https://example.com/a",
        href: "https://example.com/a",
      },
      { type: "text", value: ". " },
      { type: "hashtag", value: "#React", tag: "React" },
      { type: "text", value: "!" },
    ]);
  });

  it("ignores emails, mid-word hashes, numbers and overlong handles", () => {
    const text = "mail me@example.com a#b #2024 @this_handle_is_way_too_long";
    expect(tokenizeTweet(text)).toEqual([{ type: "text", value: text }]);
  });

  it("supports non-Latin hashtags and keeps line breaks", () => {
    expect(tokenizeTweet("line one\n#İstanbul")).toEqual([
      { type: "text", value: "line one\n" },
      { type: "hashtag", value: "#İstanbul", tag: "İstanbul" },
    ]);
  });

  it("returns nothing for empty text", () => {
    expect(tokenizeTweet("")).toEqual([]);
  });
});

describe("displayUrl", () => {
  it("drops the scheme and shortens long URLs", () => {
    expect(displayUrl("https://www.example.com/")).toBe("example.com/");
    expect(
      displayUrl("https://example.com/a/very/long/path/that/keeps/going", 20)
    ).toBe("example.com/a/very/…");
  });
});

describe("safeHref", () => {
  it("only allows http(s)", () => {
    expect(safeHref("https://ilhanozkan.com")).toBe("https://ilhanozkan.com/");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,hi")).toBeNull();
    expect(safeHref("not a url")).toBeNull();
    expect(safeHref(null)).toBeNull();
  });
});
