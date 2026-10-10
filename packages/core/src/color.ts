// Color math for the theme (CLAUDE.md → Design): OKLCH, which the CSS tokens use, to and from
// sRGB, plus WCAG contrast. OKLab formulas by Björn Ottosson (https://bottosson.github.io/posts/oklab/).

/** A color in OKLCH: lightness 0–1, chroma 0–about 0.37, hue in degrees. */
export interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

/** sRGB channels 0–1 (gamma-encoded, as in hex colors). */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const DEGREES = Math.PI / 180;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function fromLinear(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

/** Linear sRGB; channels may fall outside 0–1 when the color is out of the sRGB gamut. */
function oklchToLinearRgb({ l, c, h }: Oklch): Rgb {
  const a = c * Math.cos(h * DEGREES);
  const b = c * Math.sin(h * DEGREES);
  const lms = [
    (l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    (l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    (l - 0.0894841775 * a - 1.291485548 * b) ** 3,
  ] as const;
  return {
    r: 4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2],
    g: -1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2],
    b: -0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2],
  };
}

/** Whether the color can be shown in sRGB without clipping (a tiny tolerance for rounding). */
export function isInSrgbGamut(color: Oklch): boolean {
  const { r, g, b } = oklchToLinearRgb(color);
  return [r, g, b].every((channel) => channel >= -1e-4 && channel <= 1 + 1e-4);
}

/** sRGB, clipped to the gamut. */
export function oklchToRgb(color: Oklch): Rgb {
  const { r, g, b } = oklchToLinearRgb(color);
  return { r: fromLinear(clamp01(r)), g: fromLinear(clamp01(g)), b: fromLinear(clamp01(b)) };
}

export function rgbToOklch({ r, g, b }: Rgb): Oklch {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const l = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const c = Math.hypot(a, bb);
  // Grays have no hue; 0 keeps the result stable.
  const h = c < 1e-4 ? 0 : (Math.atan2(bb, a) / DEGREES + 360) % 360;
  return { l, c, h };
}

const HEX_PATTERN = /^#([0-9a-f]{6})$/i;

/** `#rrggbb` (any case) to sRGB; null for anything else. */
export function parseHex(hex: string): Rgb | null {
  const digits = HEX_PATTERN.exec(hex)?.[1];
  if (digits === undefined) return null;
  const value = Number.parseInt(digits, 16);
  return { r: ((value >> 16) & 255) / 255, g: ((value >> 8) & 255) / 255, b: (value & 255) / 255 };
}

/** Lowercase `#rrggbb`. */
export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b]
    .map((channel) =>
      Math.round(clamp01(channel) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

export function oklchToHex(color: Oklch): string {
  return rgbToHex(oklchToRgb(color));
}

/** WCAG 2 relative luminance. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG 2 contrast ratio, 1–21. */
export function contrastRatio(first: Rgb, second: Rgb): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (x, y) => y - x,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA minimums: body text, and large text, icons and borders. */
export const CONTRAST_TEXT = 4.5;
export const CONTRAST_NON_TEXT = 3;
