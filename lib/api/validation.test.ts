import { describe, expect, it } from "vitest";

import { encodeCursor } from "../db/cursor";
import {
  cents,
  createTweetBody,
  cursorParam,
  isSafeImageUrl,
  listTweetsQuery,
  note,
  placeId,
  plainText,
  routeId,
  routeKey,
  tweetText,
  username,
} from "./validation";

const messages = (result: { error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((issue) => issue.message);

describe("tweetText", () => {
  it("normalizes line endings, strips control characters and trims", () => {
    expect(tweetText.parse("  a\r\nb\rc\u0000\u001b[31m\t ")).toBe(
      "a\nb\nc[31m"
    );
    // Bidi overrides and isolates, but not the LTR/RTL marks.
    expect(tweetText.parse("a\u202Eb\u2066c\u200Fd")).toBe("abc\u200Fd");
    // C1 controls too (U+0085 NEXT LINE, U+009B CSI), but not tabs inside text.
    expect(tweetText.parse("a\u0085b\u009b2Jc\td")).toBe("ab2Jc\td");
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
    // Browsers strip tabs and newlines from URLs, turning these into "//".
    ["/\t/evil.example/a.png", false],
    ["/\n/evil.example/a.png", false],
    ["/media/a b.png", false],
    ["https://cdn.example/a.png\u0000", false],
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

  it("takes an optional product attachment with a dot-free id", () => {
    const attachment = { type: "product", productId: "seed-p-kk-latte" };
    expect(createTweetBody.parse({ text: "hi", attachment })).toEqual({
      text: "hi",
      attachment,
    });
    expect(createTweetBody.parse({ text: "hi", attachment: null })).toEqual({
      text: "hi",
      attachment: null,
    });
    for (const bad of [
      { type: "link", productId: "seed-p-kk-latte" },
      { type: "product", productId: "private.seed-p-kk-latte" },
      { type: "product" },
      "seed-p-kk-latte",
    ]) {
      expect(
        createTweetBody.safeParse({ text: "hi", attachment: bad }).success,
        JSON.stringify(bad)
      ).toBe(false);
    }
  });
});

describe("plainText", () => {
  it("sanitizes like Tweet text and names the field in errors", () => {
    const bio = plainText({ max: 5, label: "Bio" });
    expect(bio.parse("  a\u202Eb\r\n ")).toBe("ab");
    expect(messages(bio.safeParse("   "))).toEqual(["Bio cannot be empty"]);
    expect(messages(bio.safeParse("😀".repeat(6)))).toEqual([
      "Bio must be at most 5 characters",
    ]);
    expect(messages(bio.safeParse(1))).toEqual(["Bio is required"]);
  });

  it("can allow empty text", () => {
    const caption = plainText({ max: 5, allowEmpty: true, label: "Caption" });
    expect(caption.parse("  ")).toBe("");
    expect(messages(caption.safeParse(1))).toEqual(["Caption must be text"]);
  });
});

describe("note", () => {
  const schema = note(100);

  it("is sanitized text, or null when missing or blank", () => {
    expect(schema.parse(" Thanks 🙏\u0007 ")).toBe("Thanks 🙏");
    for (const empty of [undefined, null, "", " \n "]) {
      expect(schema.parse(empty), JSON.stringify(empty)).toBeNull();
    }
  });

  it("counts code points and rejects other types", () => {
    expect(schema.parse("😀".repeat(100))).toBe("😀".repeat(100));
    expect(messages(schema.safeParse("x".repeat(101)))).toEqual([
      "Note must be at most 100 characters",
    ]);
    expect(messages(schema.safeParse(42))).toEqual(["Note must be text"]);
  });
});

describe("cents", () => {
  const amount = cents(50, 20_000);

  it("accepts whole cents within the bounds", () => {
    expect(amount.parse(50)).toBe(50);
    expect(amount.parse(20_000)).toBe(20_000);
  });

  it.each([
    [12.5, "Amount must be a whole number of cents"],
    ["250", "Amount must be a number of cents"],
    [null, "Amount must be a number of cents"],
    [0, "Amount must be at least 0.50 credits"],
    [-100, "Amount must be at least 0.50 credits"],
    [49, "Amount must be at least 0.50 credits"],
    [20_001, "Amount must be at most 200.00 credits"],
  ])("rejects %j", (value, message) => {
    expect(messages(amount.safeParse(value))).toEqual([message]);
  });

  it("rejects unsafe integers", () => {
    expect(cents(50, Number.MAX_VALUE).safeParse(2 ** 60).success).toBe(false);
  });
});

describe("username, placeId and cursorParam", () => {
  it("validate their formats", () => {
    expect(username.safeParse("Sarah_Codes1").success).toBe(true);
    expect(messages(username.safeParse("sarah-codes"))).toEqual([
      "Invalid username",
    ]);
    expect(username.safeParse("x".repeat(16)).success).toBe(false);
    expect(messages(username.safeParse(42))).toEqual(["Invalid username"]);
    expect(messages(username.safeParse(undefined))).toEqual([
      "Username is required",
    ]);

    expect(placeId.parse("atakule")).toBe("atakule");
    expect(messages(placeId.safeParse("paris"))).toEqual(["Unknown place"]);

    const cursor = encodeCursor({
      createdAt: "2026-10-09T12:00:00.000Z",
      id: "seed-tx01",
    });
    expect(cursorParam.parse(cursor)).toBe(cursor);
    expect(messages(cursorParam.safeParse("nope"))).toEqual(["Invalid cursor"]);
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

describe("routeId", () => {
  const req = (id: unknown) => ({ query: { id } }) as never;

  it("accepts document ids", () => {
    expect(routeId(req("seed-t01"))).toBe("seed-t01");
    expect(routeId(req("a.b_c-1"))).toBe("a.b_c-1");
  });

  it("reports anything else as not found", () => {
    for (const id of ["../etc", "a/b", "", "x".repeat(129), ["a"], undefined]) {
      expect(() => routeId(req(id)), String(id)).toThrow("Tweet not found");
    }
  });
});

describe("routeKey", () => {
  const req = (id: unknown) => ({ query: { id } }) as never;

  it("accepts dot-free keys", () => {
    expect(routeKey(req("seed-tx01"), "id", "Transfer not found")).toBe(
      "seed-tx01"
    );
    expect(routeKey(req("tx-0123abcd_X"), "id", "Transfer not found")).toBe(
      "tx-0123abcd_X"
    );
  });

  it("reports anything else, private and draft ids included, as not found", () => {
    for (const id of [
      "private.seed-tx01",
      "drafts.seed-tx01",
      "a/b",
      "",
      "x".repeat(121),
      ["a"],
      undefined,
    ]) {
      expect(
        () => routeKey(req(id), "id", "Transfer not found"),
        String(id)
      ).toThrow("Transfer not found");
    }
  });
});
