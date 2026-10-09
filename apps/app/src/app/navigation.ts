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
  RefreshCwIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  UserCogIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react';
import type { FileRouteTypes } from '@/routeTree.gen';

export type AppPath = FileRouteTypes['to'];
export type NavItemKey = keyof Resources['nav']['items'];
export type NavGroupKey = keyof Resources['nav']['groups'];

export interface NavItem {
  readonly key: NavItemKey;
  readonly icon: LucideIcon;
  /** Not set until the module is built in its phase; the menu shows it as "soon". */
  readonly to?: AppPath;
  /** Hidden from staff without it. Revisit when the module is built. */
  readonly permission?: string;
}

export interface NavGroup {
  readonly key: NavGroupKey;
  readonly items: readonly NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    key: 'main',
    items: [
      { key: 'home', icon: HouseIcon, to: '/' },
      { key: 'checkin', icon: NfcIcon, permission: 'checkin.perform' },
    ],
  },
  {
    key: 'members',
    items: [
      { key: 'members', icon: UsersIcon, permission: 'members.view' },
      { key: 'plans', icon: ClipboardListIcon, permission: 'plans.manage' },
      { key: 'subscriptions', icon: IdCardIcon, permission: 'members.view' },
    ],
  },
  {
    key: 'finance',
    items: [
      { key: 'payments', icon: WalletIcon, permission: 'payments.view' },
      { key: 'shop', icon: ShoppingBagIcon, permission: 'pos.sell' },
      { key: 'cashRegister', icon: BanknoteIcon, permission: 'cash_register.operate' },
    ],
  },
  {
    key: 'services',
    items: [
      { key: 'lockers', icon: KeyRoundIcon, permission: 'lockers.view' },
      { key: 'spa', icon: BathIcon, permission: 'spa.view' },
      { key: 'classes', icon: CalendarDaysIcon, permission: 'classes.view' },
      { key: 'trainers', icon: DumbbellIcon, permission: 'pt.log' },
    ],
  },
  {
    key: 'management',
    items: [
      { key: 'staff', icon: UserCogIcon, permission: 'staff.view' },
      { key: 'roles', icon: ShieldCheckIcon, permission: 'roles.manage' },
      { key: 'branches', icon: Building2Icon, permission: 'branches.manage' },
      { key: 'reports', icon: ChartColumnIcon, permission: 'reports.view' },
      { key: 'notifications', icon: BellIcon, permission: 'notifications.send' },
      { key: 'auditLog', icon: HistoryIcon, permission: 'audit.view' },
    ],
  },
  {
    key: 'system',
    items: [
      { key: 'sync', icon: RefreshCwIcon },
      { key: 'devices', icon: MonitorSmartphoneIcon, permission: 'devices.manage' },
      { key: 'settings', icon: SettingsIcon, to: '/settings/display' },
    ],
  },
];

/** The menu as one staff member sees it: items they lack the permission for are left out. */
export function visibleNavGroups(permissions: ReadonlySet<string>): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || permissions.has(item.permission)),
  })).filter((group) => group.items.length > 0);
}

/** Pages that exist already, and that the staff member may open: offered in the search palette. */
export function navPages(permissions: ReadonlySet<string>) {
  return visibleNavGroups(permissions)
    .flatMap((group) => group.items)
    .filter((item): item is NavItem & { readonly to: AppPath } => item.to !== undefined);
}
