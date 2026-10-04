// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { create, type Font } from 'fontkit';
import { describe, expect, it } from 'vitest';

/**
 * The bundled fonts must contain every letter we display. A missing glyph would silently fall
 * back to a system font (or a box) on devices without a good Arabic-script font.
 */
const VAZIRMATN_FILES = fileURLToPath(
  new URL('../node_modules/@fontsource-variable/vazirmatn/files/', import.meta.url),
);
const UNISALAR_FILE = fileURLToPath(
  new URL('../src/assets/fonts/unisalar-f-007.ttf', import.meta.url),
);
const STYLES_FILE = fileURLToPath(new URL('../src/styles.css', import.meta.url));

function openFont(path: string): Font {
  const font = create(readFileSync(path));
  if (!('hasGlyphForCodePoint' in font)) {
    throw new Error(`Expected a single font, not a collection: ${path}`);
  }
  return font;
}

function openVazirmatnArabic(): Font {
  const file = readdirSync(VAZIRMATN_FILES).find(
    (name) => name.includes('-arabic-') && name.endsWith('.woff2'),
  );
  if (!file) throw new Error('Vazirmatn Arabic subset not found');
  return openFont(`${VAZIRMATN_FILES}${file}`);
}

const SORANI_LETTERS = 'ئابپتجچحخدرڕزژسشعغفڤقکگلڵمنهەوۆیێ';
const ARABIC_ONLY_LETTERS = 'ءآأإؤةيكى';
const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const ARABIC_PUNCTUATION = '،؛؟';
const ARABIC_NUMBER_SEPARATORS = '٫٬';
const ZWNJ = '‌';

function missingGlyphs(font: Font, characters: string): string[] {
  return Array.from(characters).filter(
    (char) => !font.hasGlyphForCodePoint(char.codePointAt(0) ?? 0),
  );
}

describe('Vazirmatn (Arabic UI, and fallback for Kurdish)', () => {
  const font = openVazirmatnArabic();

  it('has every Kurdish Sorani letter', () => {
    expect(missingGlyphs(font, SORANI_LETTERS)).toEqual([]);
  });

  it('has the Arabic letters that Sorani does not use', () => {
    expect(missingGlyphs(font, ARABIC_ONLY_LETTERS)).toEqual([]);
  });

  it('has Eastern Arabic digits, Arabic punctuation and number separators', () => {
    expect(
      missingGlyphs(font, ARABIC_INDIC_DIGITS + ARABIC_PUNCTUATION + ARABIC_NUMBER_SEPARATORS),
    ).toEqual([]);
  });
});

describe('UniSalar (Kurdish UI font)', () => {
  const font = openFont(UNISALAR_FILE);

  it('has every Kurdish Sorani letter', () => {
    expect(missingGlyphs(font, SORANI_LETTERS)).toEqual([]);
  });

  it('has Eastern Arabic digits, Arabic punctuation and the zero-width non-joiner', () => {
    // The Arabic number separators (٫ ٬) are missing; they fall back to Vazirmatn.
    expect(missingGlyphs(font, ARABIC_INDIC_DIGITS + ARABIC_PUNCTUATION + ZWNJ)).toEqual([]);
  });
});

/** Parses the `unicode-range` of the @font-face that declares the given family. */
function unicodeRangeOf(css: string, family: string): (codePoint: number) => boolean {
  const face = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)]
    .map((match) => match[1] ?? '')
    .find((body) => body.includes(`'${family}'`));
  const range = face?.match(/unicode-range:\s*([^;]+);/)?.[1];
  if (!range) throw new Error(`No unicode-range for ${family} in styles.css`);
  const spans = range.split(',').map((part) => {
    const [start = '', end] = part.trim().replace(/^U\+/i, '').split('-');
    return [Number.parseInt(start, 16), Number.parseInt(end ?? start, 16)] as const;
  });
  return (codePoint) => spans.some(([start, end]) => codePoint >= start && codePoint <= end);
}

describe('UniSalar unicode-range in styles.css', () => {
  const covers = unicodeRangeOf(readFileSync(STYLES_FILE, 'utf8'), 'UniSalar');

  it('covers the Kurdish letters, so Kurdish text uses UniSalar', () => {
    const uncovered = Array.from(SORANI_LETTERS).filter(
      (char) => !covers(char.codePointAt(0) ?? 0),
    );
    expect(uncovered).toEqual([]);
  });

  it('leaves ASCII (except the space) to Vazirmatn', () => {
    // UniSalar draws ASCII digits as Eastern Arabic and the comma as "،". If it rendered them,
    // the Western-digit default and Latin phone numbers, card UIDs and invoice numbers would break.
    const covered: string[] = [];
    for (let codePoint = 0x21; codePoint <= 0x7e; codePoint += 1) {
      if (covers(codePoint)) covered.push(String.fromCharCode(codePoint));
    }
    expect(covered).toEqual([]);
  });
});
