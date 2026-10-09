import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { contrastRatio, parseColor } from "./contrast";

// The SuperApp text colors must stay readable (WCAG AA, 4.5:1) on the page
// and panel backgrounds in both themes, and badges (white on the filled
// primary) too. The values are read from the real stylesheet and config.

const css = readFileSync(
  path.join(__dirname, "../../styles/globals.css"),
  "utf8"
);

/** The theme tokens declared in a CSS block that starts with `selector`. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const block = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries(
    [...block.matchAll(/--color-([a-z-]+):\s*([\d\s]+);/g)].map((match) => [
      match[1],
      match[2].trim(),
    ])
  );
}

const themes = {
  light: tokens(":root {"),
  dark: tokens(':root[data-theme="dark"]'),
  "dark (no JS)": tokens(":root:not([data-theme])"),
};

describe("contrast", () => {
  it("computes WCAG ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("255 255 255", "255 255 255")).toBe(1);
    expect(contrastRatio("#1570c2", "#ffffff")).toBeCloseTo(5.09, 2);
    expect(parseColor("#1570C2")).toEqual([21, 112, 194]);
    expect(() => parseColor("red")).toThrow();
    expect(() => parseColor("1 2 300")).toThrow();
  });

  it.each(Object.entries(themes))(
    "keeps tip and success readable on surface and subtle (%s)",
    (_theme, colors) => {
      for (const token of ["tip", "success"]) {
        for (const background of ["surface", "subtle"]) {
          expect(colors[token], token).toBeDefined();
          expect(
            contrastRatio(colors[token], colors[background]),
            `${token} on ${background}`
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  );

  it("declares the same tokens in all three theme blocks", () => {
    expect(Object.keys(themes.dark).sort()).toEqual(
      Object.keys(themes.light).sort()
    );
    expect(themes["dark (no JS)"]).toEqual(themes.dark);
  });

  it("keeps badge text (white on primary-fill) readable", async () => {
    const config = (await import("../../tailwind.config.js")).default as {
      theme: {
        extend: { colors: { "primary-fill": { DEFAULT: string } } };
      };
    };
    const fill = config.theme.extend.colors["primary-fill"].DEFAULT;
    expect(contrastRatio("#ffffff", fill)).toBeGreaterThanOrEqual(4.5);
  });
});
