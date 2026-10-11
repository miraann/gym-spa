import { toLatinDigits } from './digits.ts';

// Search that finds Kurdish and Arabic names however they were typed (CLAUDE.md → Language):
// Arabic and Kurdish look-alike letters match each other, as do Eastern Arabic and Latin digits,
// capitals and small letters.

const LOOK_ALIKES: Readonly<Record<string, string>> = {
  ي: 'ی',
  ى: 'ی',
  ك: 'ک',
  ة: 'ە',
  ه: 'ە',
  ۀ: 'ە',
  أ: 'ا',
  إ: 'ا',
  آ: 'ا',
};

/** The form two texts are compared in. */
export function normalizeSearchText(text: string): string {
  return toLatinDigits(text)
    .toLowerCase()
    .replace(/[ً-ٟـ]/g, '')
    .replace(/[يىكةهۀأإآ]/g, (letter) => LOOK_ALIKES[letter] ?? letter)
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
