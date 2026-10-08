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

  it("ends URLs at bidi controls and leaves URLs with credentials as text", () => {
    expect(tokenizeTweet("Log in: https://x.co/\u202Emoc.lapyap")[1]).toEqual({
      type: "url",
      value: "https://x.co/",
      href: "https://x.co/",
    });
    const phishing =
      "https://www.google.com.accounts.signin@evil.example/login";
    expect(tokenizeTweet(phishing)).toEqual([
      { type: "text", value: phishing },
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

  it("always shows the whole host", () => {
    expect(
      displayUrl("https://www.google.com.accounts.signin.secure.example/login")
    ).toBe("google.com.accounts.signin.secure.example/…");
    // Internationalized hosts as punycode, so look-alike letters show.
    expect(displayUrl("https://аpple.com/")).toBe("xn--pple-43d.com/");
  });

  it("shows readable paths without invisible controls", () => {
    expect(displayUrl("https://example.com/%C3%A7ay")).toBe("example.com/çay");
    expect(displayUrl("https://example.com/a%E2%80%AEb")).toBe(
      "example.com/ab"
    );
  });
});

describe("safeHref", () => {
  it("only allows http(s)", () => {
    expect(safeHref("https://ilhanozkan.com")).toBe("https://ilhanozkan.com/");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,hi")).toBeNull();
    expect(safeHref("not a url")).toBeNull();
    expect(safeHref(null)).toBeNull();
    expect(safeHref("https://bank.com@evil.example/")).toBeNull();
  });
});
