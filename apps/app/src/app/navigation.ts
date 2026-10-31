import { resolveNavTabs, type NavItemKey } from '@gym/core';
import type { Resources } from '@gym/i18n';
import {
  BanknoteIcon,
  BathIcon,
  BellIcon,
  Building2Icon,
  CalendarDaysIcon,
  ChartColumnIcon,
  ClipboardListIcon,
  DumbbellIcon,
  HistoryIcon,
  HouseIcon,
  IdCardIcon,
  KeyRoundIcon,
  MonitorSmartphoneIcon,
  NfcIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  UserCogIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react';
import homeArt from '@/assets/nav-icons/home.webp';
import checkinArt from '@/assets/nav-icons/checkin.webp';
import membersArt from '@/assets/nav-icons/members.webp';
import plansArt from '@/assets/nav-icons/plans.webp';
import subscriptionsArt from '@/assets/nav-icons/subscriptions.webp';
import paymentsArt from '@/assets/nav-icons/payments.webp';
import shopArt from '@/assets/nav-icons/shop.webp';
import cashRegisterArt from '@/assets/nav-icons/cash-register.webp';
import lockersArt from '@/assets/nav-icons/lockers.webp';
import spaArt from '@/assets/nav-icons/spa.webp';
import classesArt from '@/assets/nav-icons/classes.webp';
import trainersArt from '@/assets/nav-icons/trainers.webp';
import staffArt from '@/assets/nav-icons/staff.webp';
import rolesArt from '@/assets/nav-icons/roles.webp';
import branchesArt from '@/assets/nav-icons/branches.webp';
import reportsArt from '@/assets/nav-icons/reports.webp';
import notificationsArt from '@/assets/nav-icons/notifications.webp';
import auditLogArt from '@/assets/nav-icons/audit-log.webp';
import devicesArt from '@/assets/nav-icons/devices.webp';
import settingsArt from '@/assets/nav-icons/settings.webp';
import financeGroupArt from '@/assets/nav-icons/finance.webp';
import servicesGroupArt from '@/assets/nav-icons/services.webp';
import managementGroupArt from '@/assets/nav-icons/management.webp';
import systemGroupArt from '@/assets/nav-icons/system.webp';
import type { FileRouteTypes } from '@/routeTree.gen';

export type AppPath = FileRouteTypes['to'];
export type NavGroupKey = keyof Resources['nav']['groups'];
export type { NavItemKey };

export interface NavItem {
  readonly key: NavItemKey;
  readonly icon: LucideIcon;
  /** Its 3D picture (Fluent Emoji, src/assets/nav-icons) in the top bar, rail, tabs and More. */
  readonly art: string;
  /**
   * Not set until the module is built in its phase. Until then the item is hidden everywhere (menu,
   * tabs, search); it appears by itself once its page exists.
   */
  readonly to?: AppPath;
  /** Hidden from staff without it (any of them, when several). Revisit when the module is built. */
  readonly permission?: string | readonly string[];
}

export interface NavGroup {
  readonly key: NavGroupKey;
  /** The group's 3D picture in the desktop top bar; its items' own are shown when it opens. */
  readonly art: string;
  /** Its items each get their own place in the desktop top bar instead of one group menu. */
  readonly flat?: boolean;
  readonly items: readonly NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    key: 'main',
    art: homeArt,
    flat: true,
    items: [
      { key: 'home', icon: HouseIcon, art: homeArt, to: '/' },
      {
        key: 'checkin',
        icon: NfcIcon,
        art: checkinArt,
        to: '/checkin',
        permission: 'checkin.perform',
      },
    ],
  },
  {
    key: 'members',
    art: membersArt,
    items: [
      {
        key: 'members',
        icon: UsersIcon,
        art: membersArt,
        to: '/members',
        permission: 'members.view',
      },
      {
        key: 'plans',
        icon: ClipboardListIcon,
        art: plansArt,
        to: '/plans',
        permission: 'plans.manage',
      },
      { key: 'subscriptions', icon: IdCardIcon, art: subscriptionsArt, permission: 'members.view' },
    ],
  },
  {
    key: 'finance',
    art: financeGroupArt,
    items: [
      {
        key: 'payments',
        icon: WalletIcon,
        art: paymentsArt,
        to: '/payments',
        permission: 'payments.view',
      },
      { key: 'shop', icon: ShoppingBagIcon, art: shopArt, to: '/shop', permission: 'pos.sell' },
      {
        key: 'cashRegister',
        icon: BanknoteIcon,
        art: cashRegisterArt,
        to: '/cash',
        permission: ['cash_register.operate', 'cash_register.view_all'],
      },
    ],
  },
  {
    key: 'services',
    art: servicesGroupArt,
    items: [
      {
        key: 'lockers',
        icon: KeyRoundIcon,
        art: lockersArt,
        to: '/lockers',
        permission: 'lockers.view',
      },
      { key: 'spa', icon: BathIcon, art: spaArt, to: '/spa', permission: 'spa.view' },
      {
        key: 'classes',
        icon: CalendarDaysIcon,
        art: classesArt,
        to: '/classes',
        permission: 'classes.view',
      },
      {
        key: 'trainers',
        icon: DumbbellIcon,
        art: trainersArt,
        to: '/trainers',
        permission: 'pt.log',
      },
    ],
  },
  {
    key: 'management',
    art: managementGroupArt,
    items: [
      { key: 'staff', icon: UserCogIcon, art: staffArt, to: '/staff', permission: 'staff.view' },
      {
        key: 'roles',
        icon: ShieldCheckIcon,
        art: rolesArt,
        to: '/roles',
        permission: 'roles.manage',
      },
      {
        key: 'branches',
        icon: Building2Icon,
        art: branchesArt,
        to: '/branches',
        permission: 'branches.manage',
      },
      {
        key: 'reports',
        icon: ChartColumnIcon,
        art: reportsArt,
        to: '/reports',
        permission: 'reports.view',
      },
      {
        key: 'notifications',
        icon: BellIcon,
        art: notificationsArt,
        to: '/notifications',
        permission: 'notifications.send',
      },
      {
        key: 'auditLog',
        icon: HistoryIcon,
        art: auditLogArt,
        to: '/audit',
        permission: 'audit.view',
      },
    ],
  },
  {
    key: 'system',
    art: systemGroupArt,
    items: [
      {
        key: 'devices',
        icon: MonitorSmartphoneIcon,
        art: devicesArt,
        to: '/devices',
        permission: 'devices.manage',
      },
      { key: 'settings', icon: SettingsIcon, art: settingsArt, to: '/settings' },
    ],
  },
];

const NAV_ITEMS = new Map(
  NAV_GROUPS.flatMap((group) => group.items).map((item) => [item.key, item]),
);

/** The menu item of a page. Every key of NAV_ITEM_KEYS is in the menu (navigation.test.ts). */
export function navItem(key: NavItemKey): NavItem {
  const item = NAV_ITEMS.get(key);
  if (!item) throw new Error(`No menu item ${key}`);
  return item;
}

/** Whether the item is built and the staff member may see it. */
export function canSeeNavItem(
  item: NavItem,
  permissions: ReadonlySet<string>,
): item is OpenNavItem {
  const needed = item.permission;
  return (
    item.to !== undefined &&
    (needed === undefined ||
      (typeof needed === 'string'
        ? permissions.has(needed)
        : needed.some((permission) => permissions.has(permission))))
  );
}

/** Whether the item is the page being shown (or one of its sub-pages). */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.to === undefined) return false;
  return item.to === '/' ? pathname === '/' : pathname.startsWith(item.to);
}

/** A menu item whose page exists. */
export type OpenNavItem = NavItem & { readonly to: AppPath };

export interface VisibleNavGroup extends NavGroup {
  readonly items: readonly OpenNavItem[];
}

/**
 * The menu as one staff member sees it: pages not built yet and pages they lack the permission
 * for are left out.
 */
export function visibleNavGroups(permissions: ReadonlySet<string>): VisibleNavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canSeeNavItem(item, permissions)),
  })).filter((group) => group.items.length > 0);
}

/**
 * The phone's bottom tabs of a staff member: their own choice, otherwise their role's defaults
 * (packages/core/src/nav-tabs.ts), without pages they may not see.
 */
export function navTabItems(
  saved: readonly NavItemKey[] | null,
  roleKey: string | null,
  permissions: ReadonlySet<string>,
): OpenNavItem[] {
  return resolveNavTabs(saved, roleKey, (key) => canSeeNavItem(navItem(key), permissions))
    .map(navItem)
    .filter((item) => canSeeNavItem(item, permissions));
}

/** The pages the staff member may open: offered in the search palette. */
export function navPages(permissions: ReadonlySet<string>) {
  return visibleNavGroups(permissions).flatMap((group) => group.items);
}
