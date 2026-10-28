import arAuth from './locales/ar/auth.json';
import arBranches from './locales/ar/branches.json';
import arCards from './locales/ar/cards.json';
import arCheckin from './locales/ar/checkin.json';
import arLockers from './locales/ar/lockers.json';
import arSpa from './locales/ar/spa.json';
import arHr from './locales/ar/hr.json';
import arCommon from './locales/ar/common.json';
import arDates from './locales/ar/dates.json';
import arDevices from './locales/ar/devices.json';
import arHome from './locales/ar/home.json';
import arMemberImport from './locales/ar/member-import.json';
import arMembers from './locales/ar/members.json';
import arNav from './locales/ar/nav.json';
import arPayments from './locales/ar/payments.json';
import arPermissions from './locales/ar/permissions.json';
import arPlans from './locales/ar/plans.json';
import arSettings from './locales/ar/settings.json';
import arStaff from './locales/ar/staff.json';
import arSubscriptions from './locales/ar/subscriptions.json';
import arSupport from './locales/ar/support.json';
import ckbAuth from './locales/ckb/auth.json';
import ckbBranches from './locales/ckb/branches.json';
import ckbCards from './locales/ckb/cards.json';
import ckbCheckin from './locales/ckb/checkin.json';
import ckbLockers from './locales/ckb/lockers.json';
import ckbSpa from './locales/ckb/spa.json';
import ckbHr from './locales/ckb/hr.json';
import ckbCommon from './locales/ckb/common.json';
import ckbDates from './locales/ckb/dates.json';
import ckbDevices from './locales/ckb/devices.json';
import ckbHome from './locales/ckb/home.json';
import ckbMemberImport from './locales/ckb/member-import.json';
import ckbMembers from './locales/ckb/members.json';
import ckbNav from './locales/ckb/nav.json';
import ckbPayments from './locales/ckb/payments.json';
import ckbPermissions from './locales/ckb/permissions.json';
import ckbPlans from './locales/ckb/plans.json';
import ckbSettings from './locales/ckb/settings.json';
import ckbStaff from './locales/ckb/staff.json';
import ckbSubscriptions from './locales/ckb/subscriptions.json';
import ckbSupport from './locales/ckb/support.json';
import enAuth from './locales/en/auth.json';
import enBranches from './locales/en/branches.json';
import enCards from './locales/en/cards.json';
import enCheckin from './locales/en/checkin.json';
import enLockers from './locales/en/lockers.json';
import enSpa from './locales/en/spa.json';
import enHr from './locales/en/hr.json';
import enCommon from './locales/en/common.json';
import enDates from './locales/en/dates.json';
import enDevices from './locales/en/devices.json';
import enHome from './locales/en/home.json';
import enMemberImport from './locales/en/member-import.json';
import enMembers from './locales/en/members.json';
import enNav from './locales/en/nav.json';
import enPayments from './locales/en/payments.json';
import enPermissions from './locales/en/permissions.json';
import enPlans from './locales/en/plans.json';
import enSettings from './locales/en/settings.json';
import enStaff from './locales/en/staff.json';
import enSubscriptions from './locales/en/subscriptions.json';
import enSupport from './locales/en/support.json';
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
  permissions: ckbPermissions,
  branches: ckbBranches,
  devices: ckbDevices,
  members: ckbMembers,
  cards: ckbCards,
  checkin: ckbCheckin,
  memberImport: ckbMemberImport,
  plans: ckbPlans,
  subscriptions: ckbSubscriptions,
  payments: ckbPayments,
  support: ckbSupport,
  lockers: ckbLockers,
  spa: ckbSpa,
  hr: ckbHr,
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
  permissions: enPermissions,
  branches: enBranches,
  devices: enDevices,
  members: enMembers,
  cards: enCards,
  checkin: enCheckin,
  memberImport: enMemberImport,
  plans: enPlans,
  subscriptions: enSubscriptions,
  payments: enPayments,
  support: enSupport,
  lockers: enLockers,
  spa: enSpa,
  hr: enHr,
};

const ar: GymResources = {
  common: arCommon,
  nav: arNav,
  home: arHome,
  settings: arSettings,
  dates: arDates,
  auth: arAuth,
  staff: arStaff,
  permissions: arPermissions,
  branches: arBranches,
  devices: arDevices,
  members: arMembers,
  cards: arCards,
  checkin: arCheckin,
  memberImport: arMemberImport,
  plans: arPlans,
  subscriptions: arSubscriptions,
  payments: arPayments,
  support: arSupport,
  lockers: arLockers,
  spa: arSpa,
  hr: arHr,
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
  'permissions',
  'branches',
  'devices',
  'members',
  'cards',
  'checkin',
  'memberImport',
  'plans',
  'subscriptions',
  'payments',
  'support',
  'lockers',
  'spa',
  'hr',
] as const satisfies readonly Namespace[];

export const DEFAULT_NAMESPACE = 'common' satisfies Namespace;

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof DEFAULT_NAMESPACE;
    resources: Resources;
  }
}
