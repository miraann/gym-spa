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
      { key: 'checkin', icon: NfcIcon },
    ],
  },
  {
    key: 'members',
    items: [
      { key: 'members', icon: UsersIcon },
      { key: 'plans', icon: ClipboardListIcon },
      { key: 'subscriptions', icon: IdCardIcon },
    ],
  },
  {
    key: 'finance',
    items: [
      { key: 'payments', icon: WalletIcon },
      { key: 'shop', icon: ShoppingBagIcon },
      { key: 'cashRegister', icon: BanknoteIcon },
    ],
  },
  {
    key: 'services',
    items: [
      { key: 'lockers', icon: KeyRoundIcon },
      { key: 'spa', icon: BathIcon },
      { key: 'classes', icon: CalendarDaysIcon },
      { key: 'trainers', icon: DumbbellIcon },
    ],
  },
  {
    key: 'management',
    items: [
      { key: 'staff', icon: UserCogIcon },
      { key: 'roles', icon: ShieldCheckIcon },
      { key: 'branches', icon: Building2Icon },
      { key: 'reports', icon: ChartColumnIcon },
      { key: 'notifications', icon: BellIcon },
      { key: 'auditLog', icon: HistoryIcon },
    ],
  },
  {
    key: 'system',
    items: [
      { key: 'sync', icon: RefreshCwIcon },
      { key: 'devices', icon: MonitorSmartphoneIcon },
      { key: 'settings', icon: SettingsIcon, to: '/settings/display' },
    ],
  },
];

/** Pages that exist already — offered in the search palette. */
export const NAV_PAGES = NAV_GROUPS.flatMap((group) => group.items).filter(
  (item): item is NavItem & { readonly to: AppPath } => item.to !== undefined,
);
