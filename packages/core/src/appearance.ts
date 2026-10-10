// The gym's look and each staff member's own look (spec §6.1). The server checks the stored
// values with the same rules (app.is_valid_setting, staff_users checks); tests compare them.
import {
  CONTRAST_NON_TEXT,
  CONTRAST_TEXT,
  contrastRatio,
  isInSrgbGamut,
  oklchToRgb,
  parseHex,
  rgbToOklch,
  type Oklch,
} from './color';

// Gym look: settings rows for every branch ------------------------------------------------------

export const APPEARANCE_SETTINGS = {
  brandColor: 'appearance.brand_color',
  cornerStyle: 'appearance.corner_style',
  logo: 'appearance.logo',
} as const;

export const BRAND_PRESETS = ['indigo', 'blue', 'purple', 'gray'] as const;
export type BrandPreset = (typeof BRAND_PRESETS)[number];
/** A preset name, or a custom color as lowercase `#rrggbb`. */
export type BrandColor = BrandPreset | `#${string}`;
export const DEFAULT_BRAND_COLOR: BrandColor = 'indigo';

/** The light- and dark-mode shades of each preset; all pass every contrast check (tested). */
const PRESET_SHADES: Readonly<Record<BrandPreset, { light: Oklch; dark: Oklch }>> = {
  // The same as the default tokens in apps/app/src/styles.css (a test keeps them equal).
  indigo: { light: { l: 0.51, c: 0.23, h: 277 }, dark: { l: 0.68, c: 0.17, h: 277 } },
  blue: { light: { l: 0.52, c: 0.19, h: 256 }, dark: { l: 0.7, c: 0.15, h: 256 } },
  purple: { light: { l: 0.5, c: 0.22, h: 303 }, dark: { l: 0.7, c: 0.17, h: 303 } },
  gray: { light: { l: 0.45, c: 0.025, h: 265 }, dark: { l: 0.74, c: 0.02, h: 265 } },
};

const HEX_COLOR = /^#[0-9a-f]{6}$/;

export function isBrandPreset(value: unknown): value is BrandPreset {
  return BRAND_PRESETS.some((preset) => preset === value);
}

/** A stored brand color (settings.value), or null when it isn't valid. */
export function parseBrandColor(value: unknown): BrandColor | null {
  if (isBrandPreset(value)) return value;
  if (typeof value === 'string' && HEX_COLOR.test(value)) return value as `#${string}`;
  return null;
}

export const CORNER_STYLES = ['soft', 'medium', 'sharp'] as const;
export type CornerStyle = (typeof CORNER_STYLES)[number];
export const DEFAULT_CORNER_STYLE: CornerStyle = 'soft';

/** --radius for each corner style; every other radius derives from it (styles.css). */
export const CORNER_RADIUS: Readonly<Record<CornerStyle, string>> = {
  soft: '1rem',
  medium: '0.625rem',
  sharp: '0.25rem',
};

export function parseCornerStyle(value: unknown): CornerStyle | null {
  return CORNER_STYLES.find((style) => style === value) ?? null;
}

// Brand color math --------------------------------------------------------------------------------

export type Mode = 'light' | 'dark';

/** The page backgrounds and cards the brand color sits on (the tokens in styles.css). */
function surfaces(mode: Mode, hue: number): Oklch[] {
  return mode === 'light'
    ? [
        { l: 0.972, c: 0.006, h: hue },
        { l: 0.995, c: 0.002, h: hue },
      ]
    : [
        { l: 0.17, c: 0.012, h: hue },
        { l: 0.215, c: 0.014, h: hue },
      ];
}

const LIGHT_TEXT = (hue: number): Oklch => ({ l: 0.985, c: 0.006, h: hue });
const DARK_TEXT = (hue: number): Oklch => ({ l: 0.17, c: 0.03, h: hue });

function contrast(first: Oklch, second: Oklch): number {
  return contrastRatio(oklchToRgb(first), oklchToRgb(second));
}

/** The text color for a brand-colored button: near-white or near-black, whichever reads better. */
function foregroundFor(color: Oklch): Oklch {
  const light = LIGHT_TEXT(color.h);
  const dark = DARK_TEXT(color.h);
  return contrast(light, color) >= contrast(dark, color) ? light : dark;
}

/** The weakest contrast of the color against the mode's page background and cards. */
function contrastOnSurfaces(color: Oklch, mode: Mode): number {
  return Math.min(...surfaces(mode, color.h).map((surface) => contrast(color, surface)));
}

/** Lowers chroma until the color fits in sRGB, keeping lightness and hue. */
function intoGamut(color: Oklch): Oklch {
  let { c } = color;
  while (c > 0 && !isInSrgbGamut({ ...color, c })) c = Math.max(0, c - 0.005);
  return { ...color, c };
}

/**
 * The dark-mode shade of a custom color: the same hue, a little calmer, and light enough to read
 * as text on the dark page.
 */
function darkShadeOf(color: Oklch): Oklch {
  let shade = intoGamut({ l: Math.max(color.l, 0.62), c: color.c * 0.8, h: color.h });
  while (shade.l < 0.9 && contrastOnSurfaces(shade, 'dark') < CONTRAST_TEXT) {
    shade = intoGamut({ ...shade, l: Math.round((shade.l + 0.01) * 1000) / 1000 });
  }
  return shade;
}

export interface BrandShades {
  readonly light: Oklch;
  readonly dark: Oklch;
}

/** The light- and dark-mode shades of a brand color. A custom color is used as-is in light mode. */
export function brandShades(color: BrandColor): BrandShades {
  if (isBrandPreset(color)) return PRESET_SHADES[color];
  const rgb = parseHex(color);
  if (!rgb) return PRESET_SHADES.indigo;
  const light = rgbToOklch(rgb);
  return { light, dark: darkShadeOf(light) };
}

function round(value: number, digits: number): string {
  return String(Math.round(value * 10 ** digits) / 10 ** digits);
}

function css({ l, c, h }: Oklch): string {
  return `oklch(${round(l, 3)} ${round(c, 3)} ${round(h, 1)})`;
}

/**
 * The CSS variables that give the app a brand color (they replace the --brand-* defaults in
 * styles.css at runtime, so nothing reloads).
 */
export function brandVariables(color: BrandColor): Record<string, string> {
  const { light, dark } = brandShades(color);
  return {
    '--brand-h': round(light.h, 1),
    '--brand-l': round(light.l, 3),
    '--brand-c': round(light.c, 3),
    '--brand-foreground': css(foregroundFor(light)),
    '--brand-dark-l': round(dark.l, 3),
    '--brand-dark-c': round(dark.c, 3),
    '--brand-dark-foreground': css(foregroundFor({ ...dark, h: light.h })),
  };
}

export type ContrastProblem =
  /** Text on a brand-colored button. */
  | 'text_on_brand'
  /** The brand color used for text (links, active items) on the page. */
  | 'brand_as_text'
  /** The brand color used for icons, borders and focus rings on the page. */
  | 'brand_as_icon';

export interface ContrastIssue {
  readonly mode: Mode;
  readonly problem: ContrastProblem;
}

/** What fails WCAG AA with this brand color, in light and dark mode. Empty when all is fine. */
export function checkBrandContrast(color: BrandColor): ContrastIssue[] {
  const shades = brandShades(color);
  const issues: ContrastIssue[] = [];
  for (const mode of ['light', 'dark'] as const) {
    const shade = mode === 'light' ? shades.light : { ...shades.dark, h: shades.light.h };
    if (contrast(foregroundFor(shade), shade) < CONTRAST_TEXT) {
      issues.push({ mode, problem: 'text_on_brand' });
    }
    const onPage = contrastOnSurfaces(shade, mode);
    if (onPage < CONTRAST_TEXT) issues.push({ mode, problem: 'brand_as_text' });
    if (onPage < CONTRAST_NON_TEXT) issues.push({ mode, problem: 'brand_as_icon' });
  }
  return issues;
}

/** Status hues (OKLCH degrees) that a brand color must not look like: they mean allowed, warning, denied. */
const STATUS_HUES = [
  { from: 120, to: 170 }, // green: allowed, paid
  { from: 45, to: 100 }, // amber: warning, expiring
  { from: 0, to: 40 }, // red: denied, overdue
  { from: 345, to: 360 },
] as const;
/** Below this chroma a color reads as gray, whatever its hue. */
const STATUS_MIN_CHROMA = 0.06;

/** A custom color that could be mistaken for a status color (green, amber or red). */
export function looksLikeStatusColor(color: BrandColor): boolean {
  if (isBrandPreset(color)) return false;
  const { light } = brandShades(color);
  return (
    light.c >= STATUS_MIN_CHROMA &&
    STATUS_HUES.some((range) => light.h >= range.from && light.h < range.to)
  );
}

// The logo ----------------------------------------------------------------------------------------

/** The most a stored logo may weigh; app.is_valid_setting checks the same. */
export const LOGO_MAX_BYTES = 300 * 1024;
/** Logos are resized to fit this square before saving. */
export const LOGO_MAX_SIDE = 512;
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type LogoType = (typeof LOGO_TYPES)[number];

export interface StoredLogo {
  readonly type: LogoType;
  /** base64, without a data: prefix */
  readonly data: string;
}

/** The image type from the file's first bytes (never trust the name or the browser's guess). */
export function sniffImageType(bytes: Uint8Array): LogoType | null {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  const riff = starts(0x52, 0x49, 0x46, 0x46);
  const webp = [0x57, 0x45, 0x42, 0x50].every((value, index) => bytes[8 + index] === value);
  return riff && webp ? 'image/webp' : null;
}

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Bytes the base64 text decodes to. */
export function base64Bytes(data: string): number {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return (data.length / 4) * 3 - padding;
}

/** A stored logo (settings.value) if it is valid: a known type, base64, at most LOGO_MAX_BYTES. */
export function parseLogo(value: unknown): StoredLogo | null {
  if (typeof value !== 'object' || value === null) return null;
  const record: Partial<Record<keyof StoredLogo, unknown>> = value;
  const type = LOGO_TYPES.find((each) => each === record.type);
  const { data } = record;
  if (!type || typeof data !== 'string' || data.length === 0 || !BASE64.test(data)) return null;
  return base64Bytes(data) <= LOGO_MAX_BYTES ? { type, data } : null;
}

export function logoDataUrl(logo: StoredLogo): string {
  return `data:${logo.type};base64,${logo.data}`;
}

// Each staff member's own look ------------------------------------------------------------------

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const TEXT_SIZES = ['normal', 'large'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

/** The root font size for each text size. Every size is in rem, so spacing and targets grow too. */
export const TEXT_SCALE: Readonly<Record<TextSize, string>> = {
  normal: '100%',
  large: '112.5%',
};

export function parseThemePreference(value: unknown): ThemePreference | null {
  return THEME_PREFERENCES.find((each) => each === value) ?? null;
}

export function parseTextSize(value: unknown): TextSize | null {
  return TEXT_SIZES.find((each) => each === value) ?? null;
}
