import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import {
  MonitorSmartphoneIcon,
  NfcIcon,
  PaletteIcon,
  PrinterIcon,
  ShieldCheckIcon,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { canPrintSilently } from '@gym/platform';
import { cn } from '@gym/ui/lib/utils';
import type { AppPath } from '@/app/navigation';
import { usePermission } from '@/features/auth/use-permissions';

const TABS: readonly {
  to: AppPath;
  key: 'display' | 'appearance' | 'cardReader' | 'printer' | 'support';
  icon: LucideIcon;
  /** Shown only to staff with it. */
  permission?: string;
  /** Shown only in the Windows app. */
  windowsOnly?: boolean;
}[] = [
  { to: '/settings/display', key: 'display', icon: MonitorSmartphoneIcon },
  { to: '/settings/appearance', key: 'appearance', icon: PaletteIcon },
  { to: '/settings/card-reader', key: 'cardReader', icon: NfcIcon },
  { to: '/settings/printer', key: 'printer', icon: PrinterIcon, windowsOnly: true },
  { to: '/settings/support', key: 'support', icon: ShieldCheckIcon, permission: 'support.grant' },
];

/** Settings: one page per topic, picked with a segmented control like a native app's. */
export function SettingsLayout() {
  const { t } = useTranslation('settings');
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const maySupport = usePermission('support.grant');
  const tabs = TABS.filter(
    (tab) =>
      (tab.permission === undefined || maySupport) && (!tab.windowsOnly || canPrintSilently()),
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <nav
        aria-label={t('tabs.label')}
        className="flex w-full rounded-full bg-muted p-1 sm:w-fit dark:bg-muted/70"
      >
        {tabs.map(({ to, key, icon: Icon }) => {
          const selected = pathname.startsWith(to);
          return (
            <Link
              key={key}
              to={to}
              aria-current={selected ? 'page' : undefined}
              className={cn(
                'flex h-10 flex-1 items-center justify-center gap-2 rounded-full px-3 text-sm whitespace-nowrap transition-[background-color,color,box-shadow] duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-5 pointer-coarse:h-11',
                selected
                  ? 'bg-card font-semibold text-foreground shadow-sm'
                  : 'font-medium text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon aria-hidden className="size-4.5" />
              {t(`tabs.${key}`)}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}
