import { describe, expect, it } from 'vitest';
import {
  BRAND_PRESETS,
  CORNER_STYLES,
  LOGO_MAX_BYTES,
  TEXT_SIZES,
  THEME_PREFERENCES,
  base64Bytes,
  brandShades,
  brandVariables,
  checkBrandContrast,
  looksLikeStatusColor,
  parseBrandColor,
  parseCornerStyle,
  parseLogo,
  sniffImageType,
} from './appearance.ts';
import { latestFunctionBody, migrationsSql } from './sql-functions.test-helper.ts';

describe('brand presets', () => {
  it.each(BRAND_PRESETS)('%s passes every contrast check', (preset) => {
    expect(checkBrandContrast(preset)).toEqual([]);
    expect(looksLikeStatusColor(preset)).toBe(false);
  });

  it('indigo is the default look of styles.css', () => {
    expect(brandVariables('indigo')).toMatchObject({
      '--brand-h': '277',
      '--brand-l': '0.51',
      '--brand-c': '0.23',
      '--brand-dark-l': '0.68',
      '--brand-dark-c': '0.17',
    });
  });
});

describe('custom colors', () => {
  it('uses the color as-is in light mode and derives a readable dark shade', () => {
    const { light, dark } = brandShades('#2563eb');
    expect(light.l).toBeCloseTo(0.546, 2);
    expect(dark.h).toBeCloseTo(light.h, 5);
    expect(dark.l).toBeGreaterThan(light.l);
    expect(checkBrandContrast('#2563eb').filter((issue) => issue.mode === 'dark')).toEqual([]);
  });

  it('warns about a pale color: unreadable as text on the light page', () => {
    const issues = checkBrandContrast('#fde047');
    expect(issues).toContainEqual({ mode: 'light', problem: 'brand_as_text' });
    expect(issues).toContainEqual({ mode: 'light', problem: 'brand_as_icon' });
  });

  it('warns about a mid-tone where neither white nor black text reads well on it', () => {
    expect(checkBrandContrast('#7b7b7b')).toContainEqual({
      mode: 'light',
      problem: 'brand_as_text',
    });
  });

  it.each(['#16a34a', '#f59e0b', '#dc2626', '#e11d48'])('%s looks like a status color', (hex) => {
    expect(looksLikeStatusColor(hex as `#${string}`)).toBe(true);
  });

  it.each(['#2563eb', '#7c3aed', '#0f766e', '#6b7280', '#0891b2'])(
    '%s does not look like a status color',
    (hex) => {
      expect(looksLikeStatusColor(hex as `#${string}`)).toBe(false);
    },
  );
});

describe('stored values', () => {
  it('reads brand colors: presets and lowercase hex', () => {
    expect(parseBrandColor('blue')).toBe('blue');
    expect(parseBrandColor('#4f46e5')).toBe('#4f46e5');
    for (const value of ['#4F46E5', '#fff', 'red', '', null, 3]) {
      expect(parseBrandColor(value)).toBeNull();
    }
  });

  it('reads corner styles', () => {
    expect(parseCornerStyle('sharp')).toBe('sharp');
    expect(parseCornerStyle('round')).toBeNull();
  });

  it('reads logos up to the size limit', () => {
    expect(parseLogo({ type: 'image/png', data: 'iVBORw0KGgo=' })).toEqual({
      type: 'image/png',
      data: 'iVBORw0KGgo=',
    });
    const exact = 'A'.repeat((LOGO_MAX_BYTES / 3) * 4);
    expect(base64Bytes(exact)).toBe(LOGO_MAX_BYTES);
    expect(parseLogo({ type: 'image/webp', data: exact })).not.toBeNull();
    expect(parseLogo({ type: 'image/webp', data: `${exact}AAAA` })).toBeNull();
  });

  it.each([
    { type: 'image/svg+xml', data: 'PHN2Zz4=' },
    { type: 'image/png', data: '' },
    { type: 'image/png', data: 'not base64!' },
    { type: 'image/png', data: 'abc' },
    { type: 'image/png' },
    'iVBORw0KGgo=',
    null,
  ])('refuses %j', (value) => {
    expect(parseLogo(value)).toBeNull();
  });
});

describe('sniffImageType', () => {
  const bytes = (...values: number[]) => new Uint8Array([...values, 0, 0, 0, 0, 0, 0, 0, 0]);

  it('knows PNG, JPEG and WebP by their first bytes', () => {
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))).toBe(
      'image/webp',
    );
  });

  it('refuses everything else, like SVG and GIF', () => {
    expect(
      sniffImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">')),
    ).toBeNull();
    expect(sniffImageType(new TextEncoder().encode('GIF89a......'))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

describe('the same rules as the database', () => {
  const body = latestFunctionBody('app.is_valid_setting');

  it('accepts exactly the presets and hex brand colors', () => {
    const line = /when 'appearance\.brand_color' then ([^\n]+)/.exec(body)?.[1] ?? '';
    const presets = [...(/array\[([^\]]+)\]/.exec(line)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(
      (match) => match[1],
    );
    expect(presets).toEqual([...BRAND_PRESETS]);
    expect(line).toContain("'^#[0-9a-f]{6}$'");
  });

  it('accepts exactly the corner styles', () => {
    const line = /when 'appearance\.corner_style' then ([^\n]+)/.exec(body)?.[1] ?? '';
    const list = /in \(([^)]+)\)/.exec(line)?.[1] ?? '';
    const styles = [...list.matchAll(/'([a-z]+)'/g)].map((match) => match[1]);
    expect(styles).toEqual([...CORNER_STYLES]);
  });

  it('limits logos to the same size and types', () => {
    const logo = latestFunctionBody('app.is_valid_logo');
    expect(logo).toContain(`<= ${String(LOGO_MAX_BYTES)}`);
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) expect(logo).toContain(type);
  });

  it('knows the same personal looks', () => {
    const sql = migrationsSql().join('\n');
    expect(sql).toContain(
      `theme_preference in (${THEME_PREFERENCES.map((each) => `'${each}'`).join(', ')})`,
    );
    expect(sql).toContain(`text_size in (${TEXT_SIZES.map((each) => `'${each}'`).join(', ')})`);
  });
});
