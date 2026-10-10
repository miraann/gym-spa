// The phone's bottom tab bar (CLAUDE.md → Design): 4 tabs plus "More". Each role has fixed
// default tabs; a staff member may choose their own 4, saved on their profile
// (staff_users.nav_tabs). Tabs never move by themselves: staff learn where each one is.

/**
 * Every page of the menu, in menu order. The database accepts only these in staff_users.nav_tabs
 * (app.is_valid_nav_tabs); a test keeps both lists the same. Add new pages at the end of their
 * group, and to the database in the same change.
 */
export const NAV_ITEM_KEYS = [
  'home',
  'checkin',
  'members',
  'plans',
  'subscriptions',
  'payments',
  'shop',
  'cashRegister',
  'lockers',
  'spa',
  'classes',
  'trainers',
  'staff',
  'roles',
  'branches',
  'reports',
  'notifications',
  'auditLog',
  'devices',
  'settings',
] as const;

export type NavItemKey = (typeof NAV_ITEM_KEYS)[number];

export const NAV_TAB_COUNT = 4;

/**
 * Check-in always sits in the middle slot when it is one of the tabs (a raised scan button), so
 * it's in the same place for everyone. Slots: tab, tab, middle, tab, More.
 */
export const CHECKIN_TAB: NavItemKey = 'checkin';
export const CHECKIN_TAB_INDEX = 2;

/** The default tabs of each built-in role (roles.key). Custom roles get FALLBACK_NAV_TABS. */
export const ROLE_NAV_TABS: Readonly<Record<string, readonly NavItemKey[]>> = {
  owner: ['home', 'members', 'reports', 'staff'],
  admin: ['home', 'members', 'reports', 'staff'],
  branch_manager: ['home', 'members', 'reports', 'staff'],
  receptionist: ['home', 'members', 'checkin', 'cashRegister'],
  cashier: ['home', 'shop', 'cashRegister', 'payments'],
  accountant: ['home', 'payments', 'cashRegister', 'reports'],
  trainer: ['home', 'members', 'classes', 'trainers'],
  spa_therapist: ['home', 'members', 'spa', 'lockers'],
};

export const FALLBACK_NAV_TABS: readonly NavItemKey[] = ['home', 'members', 'checkin', 'payments'];

export function isNavItemKey(value: unknown): value is NavItemKey {
  return NAV_ITEM_KEYS.some((key) => key === value);
}

/** The default tabs of a role. */
export function defaultNavTabs(roleKey: string | null): readonly NavItemKey[] {
  return roleKey !== null && Object.hasOwn(ROLE_NAV_TABS, roleKey)
    ? (ROLE_NAV_TABS[roleKey] ?? FALLBACK_NAV_TABS)
    : FALLBACK_NAV_TABS;
}

/**
 * Saved tabs (staff_users.nav_tabs) if they are valid: exactly 4 different known pages, the same
 * rule as the database. null otherwise, which means the role's defaults.
 */
export function parseNavTabs(value: unknown): NavItemKey[] | null {
  if (!Array.isArray(value) || value.length !== NAV_TAB_COUNT) return null;
  const keys = value.filter(isNavItemKey);
  return keys.length === NAV_TAB_COUNT && new Set(keys).size === NAV_TAB_COUNT ? keys : null;
}

/** Puts check-in in the middle slot, keeping the order of the others. */
export function arrangeNavTabs(tabs: readonly NavItemKey[]): NavItemKey[] {
  if (!tabs.includes(CHECKIN_TAB) || tabs.length <= CHECKIN_TAB_INDEX) return [...tabs];
  const others = tabs.filter((key) => key !== CHECKIN_TAB);
  return [...others.slice(0, CHECKIN_TAB_INDEX), CHECKIN_TAB, ...others.slice(CHECKIN_TAB_INDEX)];
}

/**
 * The tabs a staff member sees: their own choice, otherwise their role's defaults. Pages they
 * may not open are left out, and the free slots are filled with the first pages they may open,
 * in menu order. So the tabs change only when they choose, or when their permissions change.
 */
export function resolveNavTabs(
  saved: readonly NavItemKey[] | null,
  roleKey: string | null,
  canOpen: (key: NavItemKey) => boolean,
): NavItemKey[] {
  const tabs = (saved ?? defaultNavTabs(roleKey)).filter(canOpen);
  for (const key of NAV_ITEM_KEYS) {
    if (tabs.length >= NAV_TAB_COUNT) break;
    if (!tabs.includes(key) && canOpen(key)) tabs.push(key);
  }
  return arrangeNavTabs(tabs.slice(0, NAV_TAB_COUNT));
}
