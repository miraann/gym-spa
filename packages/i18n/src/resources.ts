import arAuth from './locales/ar/auth.json';
import arCommon from './locales/ar/common.json';
import arDates from './locales/ar/dates.json';
import arHome from './locales/ar/home.json';
import arNav from './locales/ar/nav.json';
import arSettings from './locales/ar/settings.json';
import arStaff from './locales/ar/staff.json';
import ckbAuth from './locales/ckb/auth.json';
import ckbCommon from './locales/ckb/common.json';
import ckbDates from './locales/ckb/dates.json';
import ckbHome from './locales/ckb/home.json';
import ckbNav from './locales/ckb/nav.json';
import ckbSettings from './locales/ckb/settings.json';
import ckbStaff from './locales/ckb/staff.json';
import enAuth from './locales/en/auth.json';
import enCommon from './locales/en/common.json';
import enDates from './locales/en/dates.json';
import enHome from './locales/en/home.json';
import enNav from './locales/en/nav.json';
import enSettings from './locales/en/settings.json';
import enStaff from './locales/en/staff.json';
import type { Language } from './languages';
// Types only (erased from every bundle): the seller panel's texts load from ./seller.ts, which the
// gym app never imports, so its bundle never contains them.
import type ckbSeller from './locales/ckb/seller.json';

// Kurdish is the source language: its files define the keys every other language must have.
const ckb = {
  common: ckbCommon,
  nav: ckbNav,
  home: ckbHome,
  settings: ckbSettings,
  dates: ckbDates,
  auth: ckbAuth,
  staff: ckbStaff,
};

/** The gym app's texts (every namespace it loads). */
export type GymResources = typeof ckb;
/** The seller panel's own namespace (packages/i18n/src/seller.ts). */
export type SellerTexts = typeof ckbSeller;
/** Every namespace, for typed keys in both apps. */
export type Resources = GymResources & { readonly seller: SellerTexts };
export type Namespace = keyof Resources;

// Typing these as `GymResources` makes a key missing from English or Arabic a compile error.
const en: GymResources = {
  common: enCommon,
  nav: enNav,
  home: enHome,
  settings: enSettings,
  dates: enDates,
  auth: enAuth,
  staff: enStaff,
};

const ar: GymResources = {
  common: arCommon,
  nav: arNav,
  home: arHome,
  settings: arSettings,
  dates: arDates,
  auth: arAuth,
  staff: arStaff,
};

export const resources: Record<Language, GymResources> = { ckb, en, ar };

export const NAMESPACES = [
  'common',
  'nav',
  'home',
  'settings',
  'dates',
  'auth',
  'staff',
] as const satisfies readonly Namespace[];

export const DEFAULT_NAMESPACE = 'common' satisfies Namespace;

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof DEFAULT_NAMESPACE;
    resources: Resources;
  }
}
