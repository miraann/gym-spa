// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { create, type Font } from 'fontkit';
import { describe, expect, it } from 'vitest';

/**
 * The bundled font must contain every letter we display. A missing glyph would silently fall
 * back to a system font (or a box) on devices without a good Arabic-script font.
 */
const VAZIRMATN_FILES = fileURLToPath(
  new URL('../node_modules/@fontsource-variable/vazirmatn/files/', import.meta.url),
);

function loadArabicSubset(): Font {
  const file = readdirSync(VAZIRMATN_FILES).find(
    (name) => name.includes('-arabic-') && name.endsWith('.woff2'),
  );
  if (!file) throw new Error('Vazirmatn Arabic subset not found');
  const font = create(readFileSync(`${VAZIRMATN_FILES}${file}`));
  if (!('hasGlyphForCodePoint' in font))
    throw new Error('Expected a single font, not a collection');
  return font;
}

const SORANI_LETTERS = 'ئابپتجچحخدرڕزژسشعغفڤقکگلڵمنهەوۆیێ';
const ARABIC_ONLY_LETTERS = 'ءآأإؤةيكى';
const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PUNCTUATION = '،؛؟٫٬';

function missingGlyphs(font: Font, characters: string): string[] {
  return Array.from(characters).filter(
    (char) => !font.hasGlyphForCodePoint(char.codePointAt(0) ?? 0),
  );
}

describe('bundled Vazirmatn font', () => {
  const font = loadArabicSubset();

  it('has every Kurdish Sorani letter', () => {
    expect(missingGlyphs(font, SORANI_LETTERS)).toEqual([]);
  });

  it('has the Arabic letters that Sorani does not use', () => {
    expect(missingGlyphs(font, ARABIC_ONLY_LETTERS)).toEqual([]);
  });

  it('has Eastern Arabic digits and Arabic punctuation', () => {
    expect(missingGlyphs(font, ARABIC_INDIC_DIGITS + PUNCTUATION)).toEqual([]);
  });
});
