import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { MonitorSmartphoneIcon, NfcIcon, PaletteIcon, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@gym/ui/lib/utils';
import type { AppPath } from '@/app/navigation';

const TABS: readonly {
  to: AppPath;
  key: 'display' | 'appearance' | 'cardReader';
  icon: LucideIcon;
}[] = [
  { to: '/settings/display', key: 'display', icon: MonitorSmartphoneIcon },
  { to: '/settings/appearance', key: 'appearance', icon: PaletteIcon },
  { to: '/settings/card-reader', key: 'cardReader', icon: NfcIcon },
];

/** Settings: one page per topic, picked with a segmented control like a native app's. */
export function SettingsLayout() {
  const { t } = useTranslation('settings');
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <nav
        aria-label={t('tabs.label')}
        className="flex w-full rounded-full bg-muted p-1 sm:w-fit dark:bg-muted/70"
      >
        {TABS.map(({ to, key, icon: Icon }) => {
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
