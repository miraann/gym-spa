import { toLatinDigits } from './digits.ts';

// Search that finds Kurdish and Arabic names however they were typed (CLAUDE.md → Language):
// Arabic and Kurdish look-alike letters match each other, as do Eastern Arabic and Latin digits,
// capitals and small letters. The database compares member searches the same way
// (app.normalize_search_text in supabase/migrations; a test compares the two).

/**
 * Letters that are compared as another letter. The Kurdish letters an Arabic keyboard can't type
 * (پ چ ژ گ ڤ ڕ ڵ ێ ۆ) match the letter Arabic-keyboard users type instead, so "ريباز" finds
 * "ڕێباز".
 */
export const SEARCH_LOOK_ALIKES: Readonly<Record<string, string>> = {
  ي: 'ی',
  ى: 'ی',
  ك: 'ک',
  ة: 'ە',
  ه: 'ە',
  ۀ: 'ە',
  ھ: 'ە',
  أ: 'ا',
  إ: 'ا',
  آ: 'ا',
  ؤ: 'و',
  پ: 'ب',
  چ: 'ج',
  ژ: 'ز',
  گ: 'ک',
  ڤ: 'ف',
  ڕ: 'ر',
  ڵ: 'ل',
  ێ: 'ی',
  ۆ: 'و',
};

/** Arabic vowel marks, tatweel and the invisible joiners and direction marks: ignored. */
export const SEARCH_IGNORED = /[ً-ٰٟـ‌-‏]/g;

const LOOK_ALIKE_LETTERS = new RegExp(`[${Object.keys(SEARCH_LOOK_ALIKES).join('')}]`, 'g');

/** The form two texts are compared in. */
export function normalizeSearchText(text: string): string {
  return toLatinDigits(text)
    .toLowerCase()
    .replace(SEARCH_IGNORED, '')
    .replace(LOOK_ALIKE_LETTERS, (letter) => SEARCH_LOOK_ALIKES[letter] ?? letter)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whether any of the texts contains the query, compared as normalizeSearchText does. */
export function matchesSearch(
  query: string,
  ...texts: readonly (string | null | undefined)[]
): boolean {
  const needle = normalizeSearchText(query);
  if (needle === '') return true;
  return texts.some((text) => text != null && normalizeSearchText(text).includes(needle));
}
