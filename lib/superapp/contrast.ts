// WCAG 2.x contrast ratios, used by tests to keep theme tokens and fixed
// palettes (badges, story backgrounds) readable in both themes.

export type Rgb = [number, number, number];

/** "#1570c2" or a theme token's "21 112 194". */
export function parseColor(value: string): Rgb {
  const text = value.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  const parts = text.split(/\s+/).map(Number);
  if (
    parts.length !== 3 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    throw new Error(`Not a color: "${value}"`);
  }
  return parts as Rgb;
}

const channel = (value: number) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** From 1 (no contrast) to 21 (black on white). */
export function contrastRatio(a: Rgb | string, b: Rgb | string): number {
  const la = relativeLuminance(typeof a === "string" ? parseColor(a) : a);
  const lb = relativeLuminance(typeof b === "string" ? parseColor(b) : b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
