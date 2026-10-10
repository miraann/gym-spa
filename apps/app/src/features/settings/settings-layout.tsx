import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { MonitorSmartphoneIcon, PaletteIcon, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Chip, ChipRow } from '@/components/chip-row';
import type { AppPath } from '@/app/navigation';

const TABS: readonly { to: AppPath; key: 'display' | 'appearance'; icon: LucideIcon }[] = [
  { to: '/settings/display', key: 'display', icon: MonitorSmartphoneIcon },
  { to: '/settings/appearance', key: 'appearance', icon: PaletteIcon },
];

/** Settings: one page per topic, picked with chips. */
export function SettingsLayout() {
  const { t } = useTranslation('settings');
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <ChipRow label={t('tabs.label')}>
        {TABS.map(({ to, key, icon: Icon }) => {
          const selected = pathname.startsWith(to);
          return (
            <Chip key={key} selected={selected} asChild>
              <Link to={to} aria-current={selected ? 'page' : undefined}>
                <Icon aria-hidden className="size-4" />
                {t(`tabs.${key}`)}
              </Link>
            </Chip>
          );
        })}
      </ChipRow>
      <Outlet />
    </div>
  );
}
