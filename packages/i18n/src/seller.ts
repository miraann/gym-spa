import i18next, { type i18n, type Module } from 'i18next';
import { DEFAULT_LANGUAGE, LANGUAGE_CODES, type Language } from './languages';
import arSeller from './locales/ar/seller.json';
import ckbSeller from './locales/ckb/seller.json';
import enSeller from './locales/en/seller.json';
import { resources as gymResources, type Namespace, type SellerTexts } from './resources';

// The seller panel's translations (apps/seller): its own namespace, plus the shared `common`
// (labels inside the shared UI components) and `dates` (Sorani month names). A separate entry
// (@gym/i18n/seller), so the gym app's bundle never contains the panel's texts.

// Typing these as `SellerTexts` makes a key missing from English or Arabic a compile error.
const en: SellerTexts = enSeller;
const ar: SellerTexts = arSeller;
const seller: Record<Language, SellerTexts> = { ckb: ckbSeller, en, ar };

export const SELLER_NAMESPACES = [
  'seller',
  'common',
  'dates',
] as const satisfies readonly Namespace[];

export const sellerResources = Object.fromEntries(
  LANGUAGE_CODES.map((language) => [
    language,
    {
      seller: seller[language],
      common: gymResources[language].common,
      dates: gymResources[language].dates,
    },
  ]),
) as Record<
  Language,
  { seller: SellerTexts } & Pick<(typeof gymResources)['ckb'], 'common' | 'dates'>
>;

/** The seller panel's i18next instance; missing translations fall back to Kurdish. */
export function createSellerI18n(language: Language, plugins: readonly Module[] = []): i18n {
  const instance = i18next.createInstance();
  for (const plugin of plugins) instance.use(plugin);
  void instance.init({
    resources: sellerResources,
    lng: language,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...LANGUAGE_CODES],
    ns: [...SELLER_NAMESPACES],
    defaultNS: 'seller',
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  return instance;
}
