import arCommon from './locales/ar/common.json';
import arDates from './locales/ar/dates.json';
import arHome from './locales/ar/home.json';
import arNav from './locales/ar/nav.json';
import arSettings from './locales/ar/settings.json';
import ckbCommon from './locales/ckb/common.json';
import ckbDates from './locales/ckb/dates.json';
import ckbHome from './locales/ckb/home.json';
import ckbNav from './locales/ckb/nav.json';
import ckbSettings from './locales/ckb/settings.json';
import enCommon from './locales/en/common.json';
import enDates from './locales/en/dates.json';
import enHome from './locales/en/home.json';
import enNav from './locales/en/nav.json';
import enSettings from './locales/en/settings.json';
import type { Language } from './languages';

// Kurdish is the source language: its files define the keys every other language must have.
const ckb = {
  common: ckbCommon,
  nav: ckbNav,
  home: ckbHome,
  settings: ckbSettings,
  dates: ckbDates,
};

export type Resources = typeof ckb;
export type Namespace = keyof Resources;

// Typing these as `Resources` makes a key missing from English or Arabic a compile error.
const en: Resources = {
  common: enCommon,
  nav: enNav,
  home: enHome,
  settings: enSettings,
  dates: enDates,
};

const ar: Resources = {
  common: arCommon,
  nav: arNav,
  home: arHome,
  settings: arSettings,
  dates: arDates,
};

export const resources: Record<Language, Resources> = { ckb, en, ar };

export const NAMESPACES = [
  'common',
  'nav',
  'home',
  'settings',
  'dates',
] as const satisfies readonly Namespace[];

export const DEFAULT_NAMESPACE = 'common' satisfies Namespace;

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof DEFAULT_NAMESPACE;
    resources: Resources;
  }
}
