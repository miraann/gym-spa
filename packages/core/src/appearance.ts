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
} from './color.ts';

// Gym look: settings rows for every branch ------------------------------------------------------

export type Mode = 'light' | 'dark';

export const APPEARANCE_SETTINGS = {
  brandColor: 'appearance.brand_color',
  cornerStyle: 'appearance.corner_style',
  logo: 'appearance.logo',
} as const;

/**
 * Add new presets at the end, together with a migration that lets the database accept them (a
 * test keeps both lists the same). An older app shows a preset it doesn't know as the default.
 */
export const BRAND_PRESETS = [
  'indigo',
  'blue',
  'purple',
  'gray',
  'midnight',
  'gold',
  'teal',
  'royal',
  'rose',
] as const;
export type BrandPreset = (typeof BRAND_PRESETS)[number];
/** A preset name, or a custom color as lowercase `#rrggbb`. */
export type BrandColor = BrandPreset | `#${string}`;
export const DEFAULT_BRAND_COLOR: BrandColor = 'indigo';

/**
 * How much the brand hue washes over the page, the bars and the borders: "calm" is a near-neutral
 * page; "tinted" gives them a clear wash of the hue (navy, lilac, rose), while cards stay almost
 * white in light mode. Text, muted text and status colors never change.
 */
export type PageTint = 'calm' | 'tinted';

export interface BrandShades {
  readonly light: Oklch;
  readonly dark: Oklch;
  readonly tint: PageTint;
}

/**
 * The light- and dark-mode shades of each preset and its page tint. All pass every contrast check,
 * and each shade is at least 30° of hue and ΔE_OK 0.1 from the status colors (tested). The dark
 * shade may turn the hue a little: a light indigo at the same hue would look blue.
 */
const PRESET_SHADES: Readonly<Record<BrandPreset, BrandShades>> = {
  // The same as the default tokens in packages/ui's theme.css (a test keeps them equal).
  indigo: { light: { l: 0.51, c: 0.23, h: 277 }, dark: { l: 0.7, c: 0.16, h: 284 }, tint: 'calm' },
  blue: { light: { l: 0.52, c: 0.19, h: 256 }, dark: { l: 0.7, c: 0.15, h: 256 }, tint: 'calm' },
  purple: { light: { l: 0.5, c: 0.22, h: 303 }, dark: { l: 0.7, c: 0.17, h: 303 }, tint: 'calm' },
  gray: { light: { l: 0.45, c: 0.025, h: 265 }, dark: { l: 0.74, c: 0.02, h: 265 }, tint: 'calm' },
  // Deep navy on a navy page; a sky blue in dark mode.
  midnight: {
    light: { l: 0.3, c: 0.07, h: 258 },
    dark: { l: 0.72, c: 0.14, h: 255 },
    tint: 'tinted',
  },
  // An antique gold; a champagne gold in dark mode. Both keep 30° away from the amber warning.
  gold: { light: { l: 0.43, c: 0.08, h: 88 }, dark: { l: 0.86, c: 0.1, h: 107 }, tint: 'calm' },
  // A sporty teal, kept 30° away from the status green.
  teal: { light: { l: 0.43, c: 0.07, h: 188 }, dark: { l: 0.79, c: 0.12, h: 186 }, tint: 'calm' },
  // A deep royal purple on a lilac page.
  royal: {
    light: { l: 0.44, c: 0.2, h: 304 },
    dark: { l: 0.72, c: 0.17, h: 305 },
    tint: 'tinted',
  },
  // Rose on a rose page: the red-pink of a colorful look, kept clear of the status red.
  rose: { light: { l: 0.53, c: 0.2, h: 340 }, dark: { l: 0.73, c: 0.15, h: 342 }, tint: 'tinted' },
};

/**
 * Ready-made looks (Appearance settings): a brand color and a corner style chosen together.
 * Choosing one fills in both; the gym can still change either afterwards.
 */
export const LOOK_PRESETS = [
  { key: 'classic', brandColor: 'indigo', cornerStyle: 'soft' },
  { key: 'midnight', brandColor: 'midnight', cornerStyle: 'medium' },
  { key: 'gold', brandColor: 'gold', cornerStyle: 'sharp' },
  { key: 'sport', brandColor: 'teal', cornerStyle: 'soft' },
  { key: 'white', brandColor: 'blue', cornerStyle: 'soft' },
  { key: 'royal', brandColor: 'royal', cornerStyle: 'soft' },
  { key: 'rose', brandColor: 'rose', cornerStyle: 'soft' },
] as const satisfies readonly {
  key: string;
  brandColor: BrandPreset;
  cornerStyle: CornerStyle;
}[];
export type LookPreset = (typeof LOOK_PRESETS)[number];
export type LookPresetKey = LookPreset['key'];

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

type Surface = 'page' | 'card' | 'popover' | 'bar' | 'muted' | 'secondary' | 'border' | 'input';

/**
 * Lightness and chroma of the surfaces each page tint gives, with the brand's hue (the
 * --brand-tint-* variables; the calm ones are the defaults in packages/ui's theme.css, a test keeps
 * them equal). Light popovers are cards; dark borders and inputs are see-through white.
 */
const TINT_SURFACES: Readonly<
  Record<PageTint, Record<Mode, Partial<Record<Surface, { l: number; c: number }>>>>
> = {
  calm: {
    light: {
      page: { l: 0.972, c: 0.006 },
      card: { l: 0.995, c: 0.002 },
      bar: { l: 0.985, c: 0.004 },
      muted: { l: 0.945, c: 0.008 },
      secondary: { l: 0.94, c: 0.012 },
      border: { l: 0.91, c: 0.01 },
      input: { l: 0.885, c: 0.014 },
    },
    dark: {
      page: { l: 0.17, c: 0.012 },
      card: { l: 0.215, c: 0.014 },
      popover: { l: 0.235, c: 0.016 },
      bar: { l: 0.195, c: 0.013 },
      muted: { l: 0.25, c: 0.016 },
      secondary: { l: 0.27, c: 0.02 },
    },
  },
  tinted: {
    light: {
      page: { l: 0.966, c: 0.015 },
      card: { l: 0.992, c: 0.003 },
      bar: { l: 0.975, c: 0.011 },
      muted: { l: 0.935, c: 0.02 },
      secondary: { l: 0.93, c: 0.025 },
      border: { l: 0.895, c: 0.025 },
      input: { l: 0.87, c: 0.03 },
    },
    dark: {
      page: { l: 0.17, c: 0.03 },
      card: { l: 0.215, c: 0.034 },
      popover: { l: 0.235, c: 0.036 },
      bar: { l: 0.195, c: 0.032 },
      muted: { l: 0.25, c: 0.035 },
      secondary: { l: 0.27, c: 0.04 },
    },
  },
};

/** The page backgrounds and cards the brand color sits on. */
function surfaces(mode: Mode, hue: number, tint: PageTint): Oklch[] {
  const { page, card, popover } = TINT_SURFACES[tint][mode];
  return [page, card, popover].flatMap((each) => (each ? [{ ...each, h: hue }] : []));
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
function contrastOnSurfaces(color: Oklch, mode: Mode, tint: PageTint = 'calm'): number {
  return Math.min(...surfaces(mode, color.h, tint).map((surface) => contrast(color, surface)));
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

/**
 * The light- and dark-mode shades of a brand color and its page tint. A custom color is used
 * as-is in light mode, on a calm page.
 */
export function brandShades(color: BrandColor): BrandShades {
  if (isBrandPreset(color)) return PRESET_SHADES[color];
  const rgb = parseHex(color);
  if (!rgb) return PRESET_SHADES.indigo;
  const light = rgbToOklch(rgb);
  return { light, dark: darkShadeOf(light), tint: 'calm' };
}

/** A brand color's page or card in this mode, as CSS (the look previews in Appearance settings). */
export function tintSurface(color: BrandColor, mode: Mode, surface: 'page' | 'card'): string {
  const { light, dark, tint } = brandShades(color);
  const value = TINT_SURFACES[tint][mode][surface] ?? { l: 1, c: 0 };
  return css({ ...value, h: (mode === 'light' ? light : dark).h });
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
  const { light, dark, tint } = brandShades(color);
  const tints = Object.entries(TINT_SURFACES[tint]).flatMap(([mode, values]) =>
    Object.entries(values).map(([surface, { l, c }]): [string, string] => [
      `--brand-tint-${mode === 'dark' ? 'dark-' : ''}${surface}`,
      `${round(l, 3)} ${round(c, 3)}`,
    ]),
  );
  return {
    ...Object.fromEntries(tints),
    '--brand-h': round(light.h, 1),
    '--brand-l': round(light.l, 3),
    '--brand-c': round(light.c, 3),
    '--brand-foreground': css(foregroundFor(light)),
    '--brand-dark-h': round(dark.h, 1),
    '--brand-dark-l': round(dark.l, 3),
    '--brand-dark-c': round(dark.c, 3),
    '--brand-dark-foreground': css(foregroundFor(dark)),
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
    const shade = mode === 'light' ? shades.light : shades.dark;
    if (contrast(foregroundFor(shade), shade) < CONTRAST_TEXT) {
      issues.push({ mode, problem: 'text_on_brand' });
    }
    const onPage = contrastOnSurfaces(shade, mode, shades.tint);
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
