// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CONTRAST_NON_TEXT,
  CONTRAST_TEXT,
  contrastRatio,
  oklchToHex,
  oklchToRgb,
  type Rgb,
} from '@gym/core';
import { describe, expect, it } from 'vitest';

/**
 * The Calm Bento tokens in styles.css must meet WCAG AA in light and dark mode, and the colors
 * the browser, the installed PWA, Android and Windows show before the app has loaded must be the
 * same as the tokens.
 */

function read(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
}

const STYLES = read('../src/styles.css');

/** The custom properties of the rule with this selector that starts with this property. */
function block(selector: string, firstProperty: string): Map<string, string> {
  const start = STYLES.indexOf(`\n${selector} {\n  ${firstProperty}:`);
  if (start < 0) throw new Error(`No ${selector} block with tokens in styles.css`);
  const body = STYLES.slice(start, STYLES.indexOf('\n}', start));
  return new Map(
    [...body.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map((match) => [
      match[1] ?? '',
      (match[2] ?? '').trim(),
    ]),
  );
}

type Mode = 'light' | 'dark';

const LIGHT = block(':root', '--brand-h');
const TOKENS: Record<Mode, Map<string, string>> = {
  light: LIGHT,
  dark: new Map([...LIGHT, ...block('.dark', '--background')]),
};

/** A token's value with every var() replaced, like the browser computes it on <html>. */
function resolve(mode: Mode, name: string, depth = 0): string {
  const value = TOKENS[mode].get(name);
  if (value === undefined) throw new Error(`Unknown token ${name} (${mode})`);
  if (depth > 10) throw new Error(`Token ${name} refers to itself`);
  return value.replace(/var\((--[\w-]+)\)/g, (_, inner: string) => resolve(mode, inner, depth + 1));
}

/** An opaque token color. */
function color(mode: Mode, name: string): Rgb {
  const value = resolve(mode, name);
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(value);
  if (!match) throw new Error(`${name} (${mode}) is not an opaque oklch() color: ${value}`);
  return oklchToRgb({ l: Number(match[1]), c: Number(match[2]), h: Number(match[3]) });
}

/** `color` drawn at this opacity over `under` (what bg-warning/10 looks like on a card). */
function over(colorRgb: Rgb, opacity: number, under: Rgb): Rgb {
  const mix = (top: number, bottom: number) => top * opacity + bottom * (1 - opacity);
  return { r: mix(colorRgb.r, under.r), g: mix(colorRgb.g, under.g), b: mix(colorRgb.b, under.b) };
}

const SURFACES = ['--background', '--card', '--popover'];

/** Text colors used directly on the page and on cards. */
const TEXT_ON_SURFACES = [
  '--foreground',
  '--muted-foreground',
  '--primary',
  '--success',
  '--warning',
  '--destructive',
];

/** [background, its text]: every pair the components draw. */
const PAIRS: readonly (readonly [string, string])[] = [
  ['--primary', '--primary-foreground'],
  ['--secondary', '--secondary-foreground'],
  ['--muted', '--muted-foreground'],
  ['--accent', '--accent-foreground'],
  ['--success', '--success-foreground'],
  ['--warning', '--warning-foreground'],
  ['--destructive', '--destructive-foreground'],
  ['--sidebar', '--sidebar-foreground'],
  ['--sidebar', '--muted-foreground'],
  ['--sidebar-accent', '--sidebar-accent-foreground'],
  ['--sidebar-primary', '--sidebar-primary-foreground'],
];

describe.each<Mode>(['light', 'dark'])('%s mode', (mode) => {
  it.each(SURFACES.flatMap((surface) => TEXT_ON_SURFACES.map((text) => [text, surface])))(
    '%s is readable on %s',
    (text, surface) => {
      expect(contrastRatio(color(mode, text), color(mode, surface))).toBeGreaterThanOrEqual(
        CONTRAST_TEXT,
      );
    },
  );

  it.each(PAIRS)('%s carries readable %s', (background, text) => {
    expect(contrastRatio(color(mode, text), color(mode, background))).toBeGreaterThanOrEqual(
      CONTRAST_TEXT,
    );
  });

  // Soft status chips and alerts: a 10% (light) or 20% (dark) tint behind status-colored text.
  it.each(['--success', '--warning', '--destructive'])(
    '%s text is readable on its own soft tint',
    (status) => {
      const opacity = mode === 'light' ? 0.1 : 0.2;
      for (const surface of SURFACES) {
        const tint = over(color(mode, status), opacity, color(mode, surface));
        expect(contrastRatio(color(mode, status), tint)).toBeGreaterThanOrEqual(CONTRAST_TEXT);
      }
    },
  );

  it('shows focus rings clearly', () => {
    for (const surface of SURFACES) {
      expect(contrastRatio(color(mode, '--ring'), color(mode, surface))).toBeGreaterThanOrEqual(
        CONTRAST_NON_TEXT,
      );
    }
  });

  it('keeps status colors fixed: they never follow the brand', () => {
    for (const status of ['--success', '--warning', '--destructive']) {
      expect(resolve(mode, status)).not.toContain('--brand');
    }
  });
});

describe('the colors shown before the app has loaded', () => {
  // The default look: indigo-violet brand on the tinted page background.
  const brand = oklchToHex({ l: 0.51, c: 0.23, h: 277 });
  const light = oklchToHex({ l: 0.972, c: 0.006, h: 277 });
  const dark = oklchToHex({ l: 0.17, c: 0.012, h: 277 });

  it('come from the tokens', () => {
    expect(resolve('light', '--primary')).toBe('oklch(0.51 0.23 277)');
    expect(resolve('light', '--background')).toBe('oklch(0.972 0.006 277)');
    expect(resolve('dark', '--background')).toBe('oklch(0.17 0.012 277)');
    expect([brand, light, dark]).toEqual(['#4f46e5', '#f5f5fa', '#0e0f15']);
  });

  it('are used by the browser bar, the PWA, the icons, Android and Windows', () => {
    const html = read('../index.html');
    expect(html).toContain(
      `<meta name="theme-color" content="${light}" media="(prefers-color-scheme: light)" />`,
    );
    expect(html).toContain(
      `<meta name="theme-color" content="${dark}" media="(prefers-color-scheme: dark)" />`,
    );

    expect(html).toContain(`var bar = dark ? '${dark}' : '${light}';`);
    expect(read('../src/lib/document.ts')).toContain(
      `THEME_BAR_COLORS = { light: '${light}', dark: '${dark}' }`,
    );

    const vite = read('../vite.config.ts');
    expect(vite).toContain(`const THEME_COLOR = '${brand}';`);
    expect(vite).toContain(`background_color: '${light}',`);
    expect(read('../pwa-assets.config.ts')).toContain(`{ background: '${brand}' }`);
    expect(read('../public/logo.svg')).toContain(`fill="${brand}"`);
    expect(read('../android/app/src/main/res/values/ic_launcher_background.xml')).toContain(
      `<color name="ic_launcher_background">${brand.toUpperCase()}</color>`,
    );
    expect(read('../../desktop/src/main.ts')).toContain(
      `backgroundColor: nativeTheme.shouldUseDarkColors ? '${dark}' : '${light}',`,
    );
  });
});
