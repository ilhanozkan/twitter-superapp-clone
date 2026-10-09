import { describe, expect, it } from "vitest";

import {
  CENTS_PER_CREDIT,
  formatAmount,
  formatCredits,
  isCents,
  parseCredits,
  spokenCredits,
} from "./money";

describe("isCents", () => {
  it("accepts safe non-negative integers only", () => {
    expect(isCents(0)).toBe(true);
    expect(isCents(450)).toBe(true);
    for (const value of [-1, 1.5, NaN, Infinity, 2 ** 53, "450", null]) {
      expect(isCents(value), String(value)).toBe(false);
    }
  });
});

describe("formatting", () => {
  it("formats amounts with grouping and two decimals, the same everywhere", () => {
    expect(CENTS_PER_CREDIT).toBe(100);
    expect(formatAmount(0)).toBe("0.00");
    expect(formatAmount(5)).toBe("0.05");
    expect(formatAmount(450)).toBe("4.50");
    expect(formatAmount(123_450)).toBe("1,234.50");
    expect(formatAmount(100_000_000)).toBe("1,000,000.00");
    expect(formatAmount(-450)).toBe("−4.50");
  });

  it("adds the unit and an optional sign", () => {
    expect(formatCredits(30_860)).toBe("308.60 credits");
    expect(formatCredits(-450)).toBe("4.50 credits");
    expect(formatCredits(1250, { sign: "always" })).toBe("+12.50 credits");
    expect(formatCredits(-450, { sign: "always" })).toBe("−4.50 credits");
    expect(formatCredits(0, { sign: "always" })).toBe("0.00 credits");
    expect(formatCredits(1250, { sign: "never" })).toBe("12.50 credits");
  });

  it("speaks the direction in words", () => {
    expect(spokenCredits(1250, "received")).toBe("received 12.50 credits");
    expect(spokenCredits(-450, "sent")).toBe("sent 4.50 credits");
    expect(spokenCredits(200)).toBe("2.00 credits");
  });
});

describe("parseCredits", () => {
  it("reads whole and decimal amounts", () => {
    expect(parseCredits("12")).toBe(1200);
    expect(parseCredits("12.5")).toBe(1250);
    expect(parseCredits("12.50")).toBe(1250);
    expect(parseCredits("0.05")).toBe(5);
    expect(parseCredits("0")).toBe(0);
  });

  it("accepts a decimal comma only without a dot", () => {
    expect(parseCredits("12,50")).toBe(1250);
    expect(parseCredits("12,5")).toBe(1250);
    expect(parseCredits("1.234,50")).toBeNull();
    expect(parseCredits("1,234.50")).toBeNull();
  });

  it("ignores surrounding whitespace", () => {
    expect(parseCredits(" 1")).toBe(100);
    expect(parseCredits("2 \n")).toBe(200);
  });

  it("rejects anything else", () => {
    for (const input of [
      "",
      " ",
      "0.001",
      "1,234",
      "-1",
      "+1",
      "1e3",
      "1 000",
      "1. 5",
      ".5",
      "5.",
      "abc",
      "١٢",
      "Infinity",
    ]) {
      expect(parseCredits(input), JSON.stringify(input)).toBeNull();
    }
  });

  it("caps at 1,000,000.00", () => {
    expect(parseCredits("1000000")).toBe(100_000_000);
    expect(parseCredits("1000000.00")).toBe(100_000_000);
    expect(parseCredits("1000000.01")).toBeNull();
    expect(parseCredits("99999999999999999999")).toBeNull();
  });
});
