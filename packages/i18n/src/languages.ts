export const LANGUAGES = {
  ckb: { dir: 'rtl', nativeName: 'کوردی' },
  ar: { dir: 'rtl', nativeName: 'العربية' },
  en: { dir: 'ltr', nativeName: 'English' },
} as const satisfies Record<string, { dir: 'rtl' | 'ltr'; nativeName: string }>;

export type Language = keyof typeof LANGUAGES;
export type Direction = (typeof LANGUAGES)[Language]['dir'];

/** Display order in language pickers. Kurdish Sorani first: it is the default. */
export const LANGUAGE_CODES = ['ckb', 'ar', 'en'] as const satisfies readonly Language[];

export const DEFAULT_LANGUAGE: Language = 'ckb';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && Object.hasOwn(LANGUAGES, value);
}

export function getDirection(language: Language): Direction {
  return LANGUAGES[language].dir;
}
