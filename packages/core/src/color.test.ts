import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  isInSrgbGamut,
  oklchToHex,
  parseHex,
  rgbToHex,
  rgbToOklch,
} from './color.ts';

const WHITE = { r: 1, g: 1, b: 1 };
const BLACK = { r: 0, g: 0, b: 0 };

describe('OKLCH and sRGB', () => {
  it('turns known OKLCH colors into the hex values browsers show', () => {
    expect(oklchToHex({ l: 1, c: 0, h: 0 })).toBe('#ffffff');
    expect(oklchToHex({ l: 0, c: 0, h: 0 })).toBe('#000000');
    // Tailwind's red-600 and indigo-600 (v4 palette), as browsers render them.
    expect(oklchToHex({ l: 0.577, c: 0.245, h: 27.325 })).toBe('#e7000b');
    expect(oklchToHex({ l: 0.511, c: 0.262, h: 276.966 })).toBe('#4f39f6');
  });

  it('round-trips hex through OKLCH', () => {
    for (const hex of ['#4f46e5', '#0f766e', '#e11d48', '#808080', '#fafafa']) {
      const rgb = parseHex(hex);
      expect(rgb).not.toBeNull();
      if (rgb) expect(oklchToHex(rgbToOklch(rgb))).toBe(hex);
    }
  });

  it('gives grays no chroma', () => {
    const gray = rgbToOklch({ r: 0.5, g: 0.5, b: 0.5 });
    expect(gray.c).toBeLessThan(1e-4);
    expect(gray.h).toBe(0);
  });

  it('knows which colors fit in sRGB', () => {
    expect(isInSrgbGamut({ l: 0.51, c: 0.23, h: 277 })).toBe(true);
    expect(isInSrgbGamut({ l: 0.9, c: 0.3, h: 277 })).toBe(false);
  });
});

describe('hex', () => {
  it('reads six-digit hex in any case', () => {
    expect(parseHex('#FF8000')).toEqual({ r: 1, g: 128 / 255, b: 0 });
    expect(rgbToHex({ r: 1, g: 128 / 255, b: 0 })).toBe('#ff8000');
  });

  it('refuses everything else', () => {
    for (const value of ['', 'ff8000', '#f80', '#ff80000', '#gg8000', 'red']) {
      expect(parseHex(value)).toBeNull();
    }
  });
});

describe('contrast', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 5);
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, WHITE)).toBe(1);
    // #767676 on white is the classic lightest gray that passes AA (4.54:1).
    const gray = parseHex('#767676');
    if (gray) expect(contrastRatio(gray, WHITE)).toBeCloseTo(4.54, 2);
  });
});
