import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import {
  Building2Icon,
  MessageCircleIcon,
  MonitorSmartphoneIcon,
  NfcIcon,
  PaletteIcon,
  PrinterIcon,
  ServerIcon,
  ShieldCheckIcon,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { canPrintSilently } from '@gym/platform';
import { cn } from '@gym/ui/lib/utils';
import type { AppPath } from '@/app/navigation';
import { usePermissions } from '@/features/auth/use-permissions';
import { useServerLink } from '@/features/server/server-link';
import { isOfflineEdition } from '@/lib/edition';

const TABS: readonly {
  to: AppPath;
  key:
    'display' | 'appearance' | 'gym' | 'cardReader' | 'printer' | 'messages' | 'support' | 'server';
  icon: LucideIcon;
  /** Shown only to staff with it. */
  permission?: string;
  /** Shown only in the Windows app. */
  windowsOnly?: boolean;
  /** Needs the internet: not in the offline edition (WhatsApp messages, Click Group's support). */
  onlineOnly?: boolean;
  /** Only on the offline edition's server PC itself (its pairing codes and paired PCs). */
  serverPcOnly?: boolean;
}[] = [
  { to: '/settings/display', key: 'display', icon: MonitorSmartphoneIcon },
  { to: '/settings/appearance', key: 'appearance', icon: PaletteIcon },
  { to: '/settings/gym', key: 'gym', icon: Building2Icon, permission: 'settings.edit' },
  { to: '/settings/card-reader', key: 'cardReader', icon: NfcIcon },
  { to: '/settings/printer', key: 'printer', icon: PrinterIcon, windowsOnly: true },
  {
    to: '/settings/messages',
    key: 'messages',
    icon: MessageCircleIcon,
    permission: 'notifications.templates.manage',
    onlineOnly: true,
  },
  {
    to: '/settings/support',
    key: 'support',
    icon: ShieldCheckIcon,
    permission: 'support.grant',
    onlineOnly: true,
  },
  {
    to: '/settings/server',
    key: 'server',
    icon: ServerIcon,
    permission: 'server.manage',
    serverPcOnly: true,
  },
];

/** Settings: one page per topic, picked with a segmented control like a native app's. */
export function SettingsLayout() {
  const { t } = useTranslation('settings');
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const permissions = usePermissions();
  const onServerPc = useServerLink().data?.local === true;
  const tabs = TABS.filter(
    (tab) =>
      (tab.permission === undefined || permissions.has(tab.permission)) &&
      (!tab.windowsOnly || canPrintSilently()) &&
      !(tab.onlineOnly && isOfflineEdition) &&
      (!tab.serverPcOnly || onServerPc),
  );
  const compact = tabs.length > 3;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <nav
        aria-label={t('tabs.label')}
        className="flex w-full overflow-x-auto rounded-full bg-muted p-1 sm:w-fit dark:bg-muted/70"
      >
        {tabs.map(({ to, key, icon: Icon }) => {
          const selected = pathname.startsWith(to);
          // More tabs than a phone fits: the others show only their icon there (named for screen
          // readers and on hover), so the row never has to scroll.
          const iconOnly = compact && !selected;
          return (
            <Link
              key={key}
              to={to}
              aria-current={selected ? 'page' : undefined}
              title={iconOnly ? t(`tabs.${key}`) : undefined}
              className={cn(
                'flex h-10 flex-1 items-center justify-center gap-2 rounded-full px-3 text-sm whitespace-nowrap transition-[background-color,color,box-shadow] duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-5 pointer-coarse:h-11',
                iconOnly && 'min-w-11 flex-none md:flex-1',
                selected
                  ? 'bg-card font-semibold text-foreground shadow-sm'
                  : 'font-medium text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon aria-hidden className="size-4.5" />
              <span className={cn(iconOnly && 'sr-only md:not-sr-only')}>{t(`tabs.${key}`)}</span>
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}
